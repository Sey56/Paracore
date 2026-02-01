import json
import logging
import time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .registry import ScriptRegistry

logger = logging.getLogger(__name__)

class DispatchIntent(BaseModel):
    """The classified intent of the user's request."""
    action_type: str = Field(description="The type of action: 'curated_single', 'curated_chain', 'generate_code', or 'conversational'")
    selected_script_names: List[str] = Field(default_factory=list, description="The names of the curated scripts to execute (in order).")
    parameter_mappings: Dict[str, Dict[str, Any]] = Field(default_factory=dict, description="Pre-filled parameters for each script (key is script name).")
    explanation: str = Field(description="A brief explanation of why this path was chosen.")

class StrategicDispatcher:
    """
    The 'Brain' of the Paracore Agent.
    Responsible for analyzing user intent and choosing between curated tools and AI generation.
    """

    def __init__(self, registry: ScriptRegistry, llm: Any):
        self.registry = registry
        self.llm = llm

    async def analyze_intent(self, query: str, context: Optional[Dict] = None) -> DispatchIntent:
        """
        Classifies the user query against the available curated scripts.
        """
        catalog = self.registry.get_catalog()

        # Inject context summary into the prompt if available
        context_summary = "None"
        if context:
            elements = context.get("selected_elements", [])
            view = context.get("active_view", "Unknown")
            context_summary = f"{len(elements)} elements selected in {view}"

        # Minify catalog to save tokens
        compact_catalog = json.dumps(catalog, separators=(',', ':'))

        system_prompt = f"""You are the Paracore AI. Intent: {context_summary}
Tools: {compact_catalog}

Rules:
1. 'curated_single' for match, 'curated_chain' for sequence.
2. Use tool 'id'.
3. Deduce parameters (mappings).
4. Explain plan.
"""
        logger.info(f"[dispatcher] Prompt built (~{len(system_prompt)//4} tokens). Calling LLM...")
        structured_llm = self.llm.with_structured_output(DispatchIntent)
        try:
            start_time = time.time()
            intent = await structured_llm.ainvoke([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ])
            end_time = time.time()

            if not intent:
                raise ValueError("LLM returned empty intent")

            logger.info(f"[dispatcher] Intent classified: {intent.action_type} in {end_time - start_time:.2f}s")
            return intent
        except Exception as e:
            logger.warning(f"Intent classification failed or returned null: {e}. Falling back to conversational.")
            return DispatchIntent(
                action_type="conversational",
                selected_script_names=[],
                explanation="I encountered an issue classifying your request, so let's just chat about it."
            )

    def deduce_parameters(self, script_metadata: Dict, context: Dict) -> Dict[str, Any]:
        """
        Auto-fills parameters based on Revit context (Selection, Levels, View).
        """
        deduced = {}
        param_defs = script_metadata.get("parameters", [])
        selected_elements = context.get("selected_elements", [])

        for p in param_defs:
            name = p.get("name").lower()
            desc = p.get("description", "").lower()
            p_type = p.get("type", "").lower()
            category_filter = p.get("revitElementCategory", "").lower()

            # 1. Match Selection (By ID)
            if "selection" in name or "selected" in name or "element" in name:
                if selected_elements:
                    # If there's a category filter, check for it
                    if category_filter:
                        ids = [e["id"] for e in selected_elements if e.get("category", "").lower() == category_filter]
                        if ids: deduced[p["name"]] = ",".join(map(str, ids))
                    else:
                        ids = [e["id"] for e in selected_elements]
                        deduced[p["name"]] = ",".join(map(str, ids))

            # 2. Match Levels
            elif "level" in name:
                # Placeholder for active level logic.
                # If the context has an active level, use it.
                if context.get("active_view_name"): # Crude level detection from view name for now
                    if "level 1" in context["active_view_name"].lower(): deduced[p["name"]] = "Level 1"
                    elif "level 2" in context["active_view_name"].lower(): deduced[p["name"]] = "Level 2"

            # 3. Match Active View
            elif "view" in name:
                deduced[p["name"]] = context.get("active_view_name")

        return deduced

    def get_plan(self, intent: DispatchIntent, context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Converts a classified intent into a concrete execution plan with deduced parameters.
        """
        plan = {
            "action": intent.action_type,
            "explanation": intent.explanation,
            "steps": []
        }

        if intent.action_type in ['curated_single', 'curated_chain']:
            for i, name in enumerate(intent.selected_script_names):
                script = self.registry.find_script_by_name(name)
                if script:
                    deduced_params = {}
                    if context:
                        deduced_params = self.deduce_parameters(script, context)

                    # Logic for workflow chaining:
                    # If this is not the first script, and it needs a parameter like 'elementId'
                    # and the previous script produces it, we mark it as 'chained'.
                    # (This is a simplified version for the model to refine during execution)

                    llm_deduced = intent.parameter_mappings.get(name, {})

                    # Merge: LLM-deduced first, then manual context fallback
                    final_deduced = {**deduced_params, **llm_deduced}

                    plan["steps"].append({
                        "type": "curated_script",
                        "script_metadata": script,
                        "deduced_parameters": final_deduced,
                        "satisfied_parameters": list(final_deduced.keys()),
                        "missing_parameters": [p["name"] for p in script.get("parameters", []) if p["name"] not in final_deduced],
                        "parameter_definitions": script.get("parameters", []), # Include full defs
                        "status": "pending"
                    })

        return plan

    async def update_plan_from_chat(self, plan: Dict, chat: str) -> Dict:
        """
        Uses an LLM to map a user's chat message to the parameters of the proposed plan.
        """
        if not plan or not plan.get("steps"):
            return plan

        # Prepare a schema of current missing parameters
        targets = []
        for i, step in enumerate(plan["steps"]):
            targets.append({
                "step_index": i,
                "script_name": step['script_metadata'].get('name'),
                "missing_parameters": step.get("missing_parameters", [])
            })

        class ParameterUpdates(BaseModel):
            updates: List[Dict[str, Any]] = Field(description="List of updates. Each update should have 'step_index', 'parameter_name', and 'value'.")

        system_prompt = f"""You are the Paracore Parameter Manager.
The current execution plan is: {json.dumps(targets)}
The user has sent a message providing more information.
Your job is to extract values for the missing parameters from the user's message.

Rules:
1. ONLY update parameters listed in the 'missing_parameters' for the corresponding step.
2. If the user mentions a value that applies to multiple steps (like 'use Level 1 everywhere'), update all relevant steps.
3. Keep existing deduced values if they are correct.
"""

        structured_llm = self.llm.with_structured_output(ParameterUpdates)
        result = await structured_llm.ainvoke([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"User message: {chat}"}
        ])

        # Apply updates to the plan
        for update in result.updates:
            idx = update.get("step_index")
            name = update.get("parameter_name")
            val = update.get("value")

            if idx is not None and idx < len(plan["steps"]):
                step = plan["steps"][idx]
                if "deduced_parameters" not in step: step["deduced_parameters"] = {}
                step["deduced_parameters"][name] = val

                # Update missing/satisfied lists
                if name in step.get("missing_parameters", []):
                    step["missing_parameters"].remove(name)
                if name not in step.get("satisfied_parameters", []):
                    step["satisfied_parameters"].append(name)

        return plan
