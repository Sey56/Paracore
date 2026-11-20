"""IFC version of the Revit ShortWallComments proof.

Reads walls shorter than MaxLengthMm, records their GlobalIds, and writes Comments to a
derived IFC. The source file is never touched. Wall length comes from a Qto Length when
present; otherwise from the major axis of the world-coordinate bounding box. The basis
used is reported, never silently assumed.
"""

import ifcopenshell.api
import ifcopenshell.geom
import ifcopenshell.util.element
import ifcopenshell.util.unit

PSET_NAME = "Pset_ParacoreAutomation"


def _wall_length_mm(model, wall):
    scale = float(ifcopenshell.util.unit.calculate_unit_scale(model))
    psets = ifcopenshell.util.element.get_psets(wall)
    for pset_name, props in psets.items():
        if not str(pset_name).lower().startswith("qto_"):
            continue
        for key in ("Length", "WallLength", "NominalLength"):
            value = props.get(key)
            if value is None:
                continue
            try:
                return float(value) * scale * 1000.0, f"qto:{pset_name}.{key}"
            except (TypeError, ValueError):
                pass

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    shape = ifcopenshell.geom.create_shape(settings, wall)
    verts = shape.geometry.verts
    xs = verts[0::3]
    ys = verts[1::3]
    if not xs or not ys:
        return None, "geometry:no-vertices"
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    return span * scale * 1000.0, "geometry:bbox-major-axis"


def _existing_pset(wall):
    for relation in wall.IsDefinedBy or []:
        if not relation.is_a("IfcRelDefinesByProperties"):
            continue
        definition = relation.RelatingPropertyDefinition
        if definition.is_a("IfcPropertySet") and definition.Name == PSET_NAME:
            return definition
    return None


def run(ctx):
    model = ctx.open_ifc()
    max_length = float(ctx.params["MaxLengthMm"])
    comment = str(ctx.params["CommentText"])

    # IfcWallStandardCase is a subtype of IfcWall in IFC4 — by_type() returns each
    # standard wall twice. Deduplicate by GlobalId before counting or writing.
    seen_guids = set()
    walls = []
    for wall in model.by_type("IfcWall") + model.by_type("IfcWallStandardCase"):
        guid = str(wall.GlobalId)
        if guid in seen_guids:
            continue
        seen_guids.add(guid)
        walls.append(wall)
    short_walls = []
    bases = set()

    for wall in walls:
        length_mm, basis = _wall_length_mm(model, wall)
        if length_mm is None:
            ctx.print(f"UNMEASURED {wall.GlobalId} | {basis}")
            continue
        if length_mm >= max_length:
            continue
        bases.add(basis)
        short_walls.append((wall, length_mm))
        ctx.print(f"SHORT WALL {wall.GlobalId} | {wall.Name or ''} | {length_mm:.0f} mm | {basis}")

    for wall, length_mm in short_walls:
        old_value = None
        for pset_name, props in ifcopenshell.util.element.get_psets(wall).items():
            if "Comments" in props:
                old_value = props["Comments"]
                break
        ctx.record_change(str(wall.GlobalId), "Comments", old_value, comment)

        if not ctx.dry_run:
            pset = _existing_pset(wall) or ifcopenshell.api.run(
                "pset.add_pset", model, product=wall, name=PSET_NAME
            )
            ifcopenshell.api.run(
                "pset.edit_pset", model, pset=pset, properties={"Comments": comment}
            )

    ctx.emit("walls_total", len(walls))
    ctx.emit("short_walls", len(short_walls))
    ctx.emit("measurement_basis", sorted(bases))
    ctx.emit("threshold_mm", max_length)
    ctx.emit("comment_text", comment)
    ctx.write_derived(model, str(ctx.params["OutputIfc"]))
