from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class SubscribeRequest(_message.Message):
    __slots__ = ("addin_version",)
    ADDIN_VERSION_FIELD_NUMBER: _ClassVar[int]
    addin_version: str
    def __init__(self, addin_version: _Optional[str] = ...) -> None: ...

class SubmitResultResponse(_message.Message):
    __slots__ = ("accepted",)
    ACCEPTED_FIELD_NUMBER: _ClassVar[int]
    accepted: bool
    def __init__(self, accepted: bool = ...) -> None: ...

class TaskEnvelope(_message.Message):
    __slots__ = ("task_id", "method_name", "payload_json")
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    METHOD_NAME_FIELD_NUMBER: _ClassVar[int]
    PAYLOAD_JSON_FIELD_NUMBER: _ClassVar[int]
    task_id: str
    method_name: str
    payload_json: bytes
    def __init__(self, task_id: _Optional[str] = ..., method_name: _Optional[str] = ..., payload_json: _Optional[bytes] = ...) -> None: ...

class TaskResult(_message.Message):
    __slots__ = ("task_id", "is_success", "result_json", "error_message")
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    RESULT_JSON_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    task_id: str
    is_success: bool
    result_json: bytes
    error_message: str
    def __init__(self, task_id: _Optional[str] = ..., is_success: bool = ..., result_json: _Optional[bytes] = ..., error_message: _Optional[str] = ...) -> None: ...

class ClearAssemblyCacheRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ClearAssemblyCacheResponse(_message.Message):
    __slots__ = ("is_success", "message")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    message: str
    def __init__(self, is_success: bool = ..., message: _Optional[str] = ...) -> None: ...

class UnregisterWatchdogSourceRequest(_message.Message):
    __slots__ = ("path",)
    PATH_FIELD_NUMBER: _ClassVar[int]
    path: str
    def __init__(self, path: _Optional[str] = ...) -> None: ...

class UnregisterWatchdogSourceResponse(_message.Message):
    __slots__ = ("is_success", "error_message", "watchdogs_removed")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    WATCHDOGS_REMOVED_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    error_message: str
    watchdogs_removed: int
    def __init__(self, is_success: bool = ..., error_message: _Optional[str] = ..., watchdogs_removed: _Optional[int] = ...) -> None: ...

class RegisterWatchdogSourceRequest(_message.Message):
    __slots__ = ("path", "parameters_json")
    PATH_FIELD_NUMBER: _ClassVar[int]
    PARAMETERS_JSON_FIELD_NUMBER: _ClassVar[int]
    path: str
    parameters_json: bytes
    def __init__(self, path: _Optional[str] = ..., parameters_json: _Optional[bytes] = ...) -> None: ...

class RegisterWatchdogSourceResponse(_message.Message):
    __slots__ = ("is_success", "error_message", "watchdogs_registered", "load_details")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    WATCHDOGS_REGISTERED_FIELD_NUMBER: _ClassVar[int]
    LOAD_DETAILS_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    error_message: str
    watchdogs_registered: int
    load_details: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, is_success: bool = ..., error_message: _Optional[str] = ..., watchdogs_registered: _Optional[int] = ..., load_details: _Optional[_Iterable[str]] = ...) -> None: ...

class GetWatchdogStatusRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class WatchdogStatus(_message.Message):
    __slots__ = ("script_path", "script_name", "summary", "status", "details_json", "timestamp", "parameters_json")
    SCRIPT_PATH_FIELD_NUMBER: _ClassVar[int]
    SCRIPT_NAME_FIELD_NUMBER: _ClassVar[int]
    SUMMARY_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    DETAILS_JSON_FIELD_NUMBER: _ClassVar[int]
    TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    PARAMETERS_JSON_FIELD_NUMBER: _ClassVar[int]
    script_path: str
    script_name: str
    summary: str
    status: str
    details_json: str
    timestamp: str
    parameters_json: str
    def __init__(self, script_path: _Optional[str] = ..., script_name: _Optional[str] = ..., summary: _Optional[str] = ..., status: _Optional[str] = ..., details_json: _Optional[str] = ..., timestamp: _Optional[str] = ..., parameters_json: _Optional[str] = ...) -> None: ...

class FailedWatchdog(_message.Message):
    __slots__ = ("script_path", "script_name", "error_message", "timestamp")
    SCRIPT_PATH_FIELD_NUMBER: _ClassVar[int]
    SCRIPT_NAME_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    script_path: str
    script_name: str
    error_message: str
    timestamp: str
    def __init__(self, script_path: _Optional[str] = ..., script_name: _Optional[str] = ..., error_message: _Optional[str] = ..., timestamp: _Optional[str] = ...) -> None: ...

class GetWatchdogStatusResponse(_message.Message):
    __slots__ = ("watchdogs", "failed_watchdogs")
    WATCHDOGS_FIELD_NUMBER: _ClassVar[int]
    FAILED_WATCHDOGS_FIELD_NUMBER: _ClassVar[int]
    watchdogs: _containers.RepeatedCompositeFieldContainer[WatchdogStatus]
    failed_watchdogs: _containers.RepeatedCompositeFieldContainer[FailedWatchdog]
    def __init__(self, watchdogs: _Optional[_Iterable[_Union[WatchdogStatus, _Mapping]]] = ..., failed_watchdogs: _Optional[_Iterable[_Union[FailedWatchdog, _Mapping]]] = ...) -> None: ...

class StopSyncSessionRequest(_message.Message):
    __slots__ = ("script_path",)
    SCRIPT_PATH_FIELD_NUMBER: _ClassVar[int]
    script_path: str
    def __init__(self, script_path: _Optional[str] = ...) -> None: ...

class StopSyncSessionResponse(_message.Message):
    __slots__ = ("is_success", "error_message")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    error_message: str
    def __init__(self, is_success: bool = ..., error_message: _Optional[str] = ...) -> None: ...

class GetCategoryParametersRequest(_message.Message):
    __slots__ = ("category_name",)
    CATEGORY_NAME_FIELD_NUMBER: _ClassVar[int]
    category_name: str
    def __init__(self, category_name: _Optional[str] = ...) -> None: ...

class ParameterDefinition(_message.Message):
    __slots__ = ("name", "storage_type", "is_builtin", "builtin_id", "revit_element_type", "builtin_name", "spec_type_id", "is_type")
    NAME_FIELD_NUMBER: _ClassVar[int]
    STORAGE_TYPE_FIELD_NUMBER: _ClassVar[int]
    IS_BUILTIN_FIELD_NUMBER: _ClassVar[int]
    BUILTIN_ID_FIELD_NUMBER: _ClassVar[int]
    REVIT_ELEMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    BUILTIN_NAME_FIELD_NUMBER: _ClassVar[int]
    SPEC_TYPE_ID_FIELD_NUMBER: _ClassVar[int]
    IS_TYPE_FIELD_NUMBER: _ClassVar[int]
    name: str
    storage_type: str
    is_builtin: bool
    builtin_id: int
    revit_element_type: str
    builtin_name: str
    spec_type_id: str
    is_type: bool
    def __init__(self, name: _Optional[str] = ..., storage_type: _Optional[str] = ..., is_builtin: bool = ..., builtin_id: _Optional[int] = ..., revit_element_type: _Optional[str] = ..., builtin_name: _Optional[str] = ..., spec_type_id: _Optional[str] = ..., is_type: bool = ...) -> None: ...

class GetCategoryParametersResponse(_message.Message):
    __slots__ = ("parameters", "error_message")
    PARAMETERS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    parameters: _containers.RepeatedCompositeFieldContainer[ParameterDefinition]
    error_message: str
    def __init__(self, parameters: _Optional[_Iterable[_Union[ParameterDefinition, _Mapping]]] = ..., error_message: _Optional[str] = ...) -> None: ...

class GetModelCategoriesRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetModelCategoriesResponse(_message.Message):
    __slots__ = ("categories", "error_message")
    CATEGORIES_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    categories: _containers.RepeatedCompositeFieldContainer[CategoryInfo]
    error_message: str
    def __init__(self, categories: _Optional[_Iterable[_Union[CategoryInfo, _Mapping]]] = ..., error_message: _Optional[str] = ...) -> None: ...

class CategoryInfo(_message.Message):
    __slots__ = ("id", "label")
    ID_FIELD_NUMBER: _ClassVar[int]
    LABEL_FIELD_NUMBER: _ClassVar[int]
    id: str
    label: str
    def __init__(self, id: _Optional[str] = ..., label: _Optional[str] = ...) -> None: ...

class PickObjectRequest(_message.Message):
    __slots__ = ("selection_type", "category_filter")
    SELECTION_TYPE_FIELD_NUMBER: _ClassVar[int]
    CATEGORY_FILTER_FIELD_NUMBER: _ClassVar[int]
    selection_type: str
    category_filter: str
    def __init__(self, selection_type: _Optional[str] = ..., category_filter: _Optional[str] = ...) -> None: ...

class PickObjectResponse(_message.Message):
    __slots__ = ("value", "is_success", "cancelled", "error_message")
    VALUE_FIELD_NUMBER: _ClassVar[int]
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    CANCELLED_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    value: str
    is_success: bool
    cancelled: bool
    error_message: str
    def __init__(self, value: _Optional[str] = ..., is_success: bool = ..., cancelled: bool = ..., error_message: _Optional[str] = ...) -> None: ...

class SelectElementsRequest(_message.Message):
    __slots__ = ("element_ids",)
    ELEMENT_IDS_FIELD_NUMBER: _ClassVar[int]
    element_ids: _containers.RepeatedScalarFieldContainer[int]
    def __init__(self, element_ids: _Optional[_Iterable[int]] = ...) -> None: ...

class SelectElementsResponse(_message.Message):
    __slots__ = ("is_success", "error_message")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    error_message: str
    def __init__(self, is_success: bool = ..., error_message: _Optional[str] = ...) -> None: ...

class CreateWorkspaceRequest(_message.Message):
    __slots__ = ("script_path",)
    SCRIPT_PATH_FIELD_NUMBER: _ClassVar[int]
    script_path: str
    def __init__(self, script_path: _Optional[str] = ...) -> None: ...

class CreateWorkspaceResponse(_message.Message):
    __slots__ = ("workspace_path", "error_message")
    WORKSPACE_PATH_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    workspace_path: str
    error_message: str
    def __init__(self, workspace_path: _Optional[str] = ..., error_message: _Optional[str] = ...) -> None: ...

class ScriptFile(_message.Message):
    __slots__ = ("file_name", "content")
    FILE_NAME_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    file_name: str
    content: str
    def __init__(self, file_name: _Optional[str] = ..., content: _Optional[str] = ...) -> None: ...

class ExecuteScriptRequest(_message.Message):
    __slots__ = ("script_content", "parameters_json", "source", "compiled_assembly", "license_tier")
    SCRIPT_CONTENT_FIELD_NUMBER: _ClassVar[int]
    PARAMETERS_JSON_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FIELD_NUMBER: _ClassVar[int]
    COMPILED_ASSEMBLY_FIELD_NUMBER: _ClassVar[int]
    LICENSE_TIER_FIELD_NUMBER: _ClassVar[int]
    script_content: str
    parameters_json: bytes
    source: str
    compiled_assembly: bytes
    license_tier: str
    def __init__(self, script_content: _Optional[str] = ..., parameters_json: _Optional[bytes] = ..., source: _Optional[str] = ..., compiled_assembly: _Optional[bytes] = ..., license_tier: _Optional[str] = ...) -> None: ...

class StructuredOutputItem(_message.Message):
    __slots__ = ("type", "data", "title")
    TYPE_FIELD_NUMBER: _ClassVar[int]
    DATA_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    type: str
    data: str
    title: str
    def __init__(self, type: _Optional[str] = ..., data: _Optional[str] = ..., title: _Optional[str] = ...) -> None: ...

class ExecuteScriptResponse(_message.Message):
    __slots__ = ("is_success", "output", "error_message", "error_details", "structured_output", "internal_data", "agent_summary", "pipeline_diagnostics", "user_rejected")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    ERROR_DETAILS_FIELD_NUMBER: _ClassVar[int]
    STRUCTURED_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    INTERNAL_DATA_FIELD_NUMBER: _ClassVar[int]
    AGENT_SUMMARY_FIELD_NUMBER: _ClassVar[int]
    PIPELINE_DIAGNOSTICS_FIELD_NUMBER: _ClassVar[int]
    USER_REJECTED_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    output: str
    error_message: str
    error_details: _containers.RepeatedScalarFieldContainer[str]
    structured_output: _containers.RepeatedCompositeFieldContainer[StructuredOutputItem]
    internal_data: str
    agent_summary: str
    pipeline_diagnostics: _containers.RepeatedScalarFieldContainer[int]
    user_rejected: bool
    def __init__(self, is_success: bool = ..., output: _Optional[str] = ..., error_message: _Optional[str] = ..., error_details: _Optional[_Iterable[str]] = ..., structured_output: _Optional[_Iterable[_Union[StructuredOutputItem, _Mapping]]] = ..., internal_data: _Optional[str] = ..., agent_summary: _Optional[str] = ..., pipeline_diagnostics: _Optional[_Iterable[int]] = ..., user_rejected: bool = ...) -> None: ...

class GetStatusRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetStatusResponse(_message.Message):
    __slots__ = ("paracore_connected", "revit_open", "revit_version", "document_open", "document_title", "document_type", "revit_install_path", "addin_server_path")
    PARACORE_CONNECTED_FIELD_NUMBER: _ClassVar[int]
    REVIT_OPEN_FIELD_NUMBER: _ClassVar[int]
    REVIT_VERSION_FIELD_NUMBER: _ClassVar[int]
    DOCUMENT_OPEN_FIELD_NUMBER: _ClassVar[int]
    DOCUMENT_TITLE_FIELD_NUMBER: _ClassVar[int]
    DOCUMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    REVIT_INSTALL_PATH_FIELD_NUMBER: _ClassVar[int]
    ADDIN_SERVER_PATH_FIELD_NUMBER: _ClassVar[int]
    paracore_connected: bool
    revit_open: bool
    revit_version: str
    document_open: bool
    document_title: str
    document_type: str
    revit_install_path: str
    addin_server_path: str
    def __init__(self, paracore_connected: bool = ..., revit_open: bool = ..., revit_version: _Optional[str] = ..., document_open: bool = ..., document_title: _Optional[str] = ..., document_type: _Optional[str] = ..., revit_install_path: _Optional[str] = ..., addin_server_path: _Optional[str] = ...) -> None: ...

class GetScriptMetadataRequest(_message.Message):
    __slots__ = ("script_files",)
    SCRIPT_FILES_FIELD_NUMBER: _ClassVar[int]
    script_files: _containers.RepeatedCompositeFieldContainer[ScriptFile]
    def __init__(self, script_files: _Optional[_Iterable[_Union[ScriptFile, _Mapping]]] = ...) -> None: ...

class GetScriptMetadataResponse(_message.Message):
    __slots__ = ("metadata", "error_message")
    METADATA_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    metadata: ScriptMetadata
    error_message: str
    def __init__(self, metadata: _Optional[_Union[ScriptMetadata, _Mapping]] = ..., error_message: _Optional[str] = ...) -> None: ...

class GetScriptParametersRequest(_message.Message):
    __slots__ = ("script_files",)
    SCRIPT_FILES_FIELD_NUMBER: _ClassVar[int]
    script_files: _containers.RepeatedCompositeFieldContainer[ScriptFile]
    def __init__(self, script_files: _Optional[_Iterable[_Union[ScriptFile, _Mapping]]] = ...) -> None: ...

class ScriptMetadata(_message.Message):
    __slots__ = ("name", "file_path", "description", "author", "categories", "dependencies", "document_type", "usage_examples", "website", "last_run", "is_protected", "is_compiled", "is_watchdog", "date_created", "date_modified")
    NAME_FIELD_NUMBER: _ClassVar[int]
    FILE_PATH_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    AUTHOR_FIELD_NUMBER: _ClassVar[int]
    CATEGORIES_FIELD_NUMBER: _ClassVar[int]
    DEPENDENCIES_FIELD_NUMBER: _ClassVar[int]
    DOCUMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    USAGE_EXAMPLES_FIELD_NUMBER: _ClassVar[int]
    WEBSITE_FIELD_NUMBER: _ClassVar[int]
    LAST_RUN_FIELD_NUMBER: _ClassVar[int]
    IS_PROTECTED_FIELD_NUMBER: _ClassVar[int]
    IS_COMPILED_FIELD_NUMBER: _ClassVar[int]
    IS_WATCHDOG_FIELD_NUMBER: _ClassVar[int]
    DATE_CREATED_FIELD_NUMBER: _ClassVar[int]
    DATE_MODIFIED_FIELD_NUMBER: _ClassVar[int]
    name: str
    file_path: str
    description: str
    author: str
    categories: _containers.RepeatedScalarFieldContainer[str]
    dependencies: _containers.RepeatedScalarFieldContainer[str]
    document_type: str
    usage_examples: _containers.RepeatedScalarFieldContainer[str]
    website: str
    last_run: str
    is_protected: bool
    is_compiled: bool
    is_watchdog: bool
    date_created: str
    date_modified: str
    def __init__(self, name: _Optional[str] = ..., file_path: _Optional[str] = ..., description: _Optional[str] = ..., author: _Optional[str] = ..., categories: _Optional[_Iterable[str]] = ..., dependencies: _Optional[_Iterable[str]] = ..., document_type: _Optional[str] = ..., usage_examples: _Optional[_Iterable[str]] = ..., website: _Optional[str] = ..., last_run: _Optional[str] = ..., is_protected: bool = ..., is_compiled: bool = ..., is_watchdog: bool = ..., date_created: _Optional[str] = ..., date_modified: _Optional[str] = ...) -> None: ...

class GetScriptParametersResponse(_message.Message):
    __slots__ = ("parameters", "error_message")
    PARAMETERS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    parameters: _containers.RepeatedCompositeFieldContainer[ScriptParameter]
    error_message: str
    def __init__(self, parameters: _Optional[_Iterable[_Union[ScriptParameter, _Mapping]]] = ..., error_message: _Optional[str] = ...) -> None: ...

class ScriptParameter(_message.Message):
    __slots__ = ("name", "type", "default_value_json", "description", "options", "multi_select", "visible_when", "numeric_type", "min", "max", "step", "is_revit_element", "revit_element_type", "revit_element_category", "requires_compute", "group", "input_type", "required", "suffix", "pattern", "enabled_when_param", "enabled_when_value", "unit", "selection_type")
    NAME_FIELD_NUMBER: _ClassVar[int]
    TYPE_FIELD_NUMBER: _ClassVar[int]
    DEFAULT_VALUE_JSON_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    MULTI_SELECT_FIELD_NUMBER: _ClassVar[int]
    VISIBLE_WHEN_FIELD_NUMBER: _ClassVar[int]
    NUMERIC_TYPE_FIELD_NUMBER: _ClassVar[int]
    MIN_FIELD_NUMBER: _ClassVar[int]
    MAX_FIELD_NUMBER: _ClassVar[int]
    STEP_FIELD_NUMBER: _ClassVar[int]
    IS_REVIT_ELEMENT_FIELD_NUMBER: _ClassVar[int]
    REVIT_ELEMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    REVIT_ELEMENT_CATEGORY_FIELD_NUMBER: _ClassVar[int]
    REQUIRES_COMPUTE_FIELD_NUMBER: _ClassVar[int]
    GROUP_FIELD_NUMBER: _ClassVar[int]
    INPUT_TYPE_FIELD_NUMBER: _ClassVar[int]
    REQUIRED_FIELD_NUMBER: _ClassVar[int]
    SUFFIX_FIELD_NUMBER: _ClassVar[int]
    PATTERN_FIELD_NUMBER: _ClassVar[int]
    ENABLED_WHEN_PARAM_FIELD_NUMBER: _ClassVar[int]
    ENABLED_WHEN_VALUE_FIELD_NUMBER: _ClassVar[int]
    UNIT_FIELD_NUMBER: _ClassVar[int]
    SELECTION_TYPE_FIELD_NUMBER: _ClassVar[int]
    name: str
    type: str
    default_value_json: str
    description: str
    options: _containers.RepeatedScalarFieldContainer[str]
    multi_select: bool
    visible_when: str
    numeric_type: str
    min: float
    max: float
    step: float
    is_revit_element: bool
    revit_element_type: str
    revit_element_category: str
    requires_compute: bool
    group: str
    input_type: str
    required: bool
    suffix: str
    pattern: str
    enabled_when_param: str
    enabled_when_value: str
    unit: str
    selection_type: str
    def __init__(self, name: _Optional[str] = ..., type: _Optional[str] = ..., default_value_json: _Optional[str] = ..., description: _Optional[str] = ..., options: _Optional[_Iterable[str]] = ..., multi_select: bool = ..., visible_when: _Optional[str] = ..., numeric_type: _Optional[str] = ..., min: _Optional[float] = ..., max: _Optional[float] = ..., step: _Optional[float] = ..., is_revit_element: bool = ..., revit_element_type: _Optional[str] = ..., revit_element_category: _Optional[str] = ..., requires_compute: bool = ..., group: _Optional[str] = ..., input_type: _Optional[str] = ..., required: bool = ..., suffix: _Optional[str] = ..., pattern: _Optional[str] = ..., enabled_when_param: _Optional[str] = ..., enabled_when_value: _Optional[str] = ..., unit: _Optional[str] = ..., selection_type: _Optional[str] = ...) -> None: ...

class GetBulkMetadataRequest(_message.Message):
    __slots__ = ("projects",)
    PROJECTS_FIELD_NUMBER: _ClassVar[int]
    projects: _containers.RepeatedCompositeFieldContainer[ScriptProjectFiles]
    def __init__(self, projects: _Optional[_Iterable[_Union[ScriptProjectFiles, _Mapping]]] = ...) -> None: ...

class ScriptProjectFiles(_message.Message):
    __slots__ = ("project_name", "absolute_path", "files")
    PROJECT_NAME_FIELD_NUMBER: _ClassVar[int]
    ABSOLUTE_PATH_FIELD_NUMBER: _ClassVar[int]
    FILES_FIELD_NUMBER: _ClassVar[int]
    project_name: str
    absolute_path: str
    files: _containers.RepeatedCompositeFieldContainer[ScriptFile]
    def __init__(self, project_name: _Optional[str] = ..., absolute_path: _Optional[str] = ..., files: _Optional[_Iterable[_Union[ScriptFile, _Mapping]]] = ...) -> None: ...

class GetBulkMetadataResponse(_message.Message):
    __slots__ = ("project_metadata",)
    PROJECT_METADATA_FIELD_NUMBER: _ClassVar[int]
    project_metadata: _containers.RepeatedCompositeFieldContainer[ScriptMetadataResponse]
    def __init__(self, project_metadata: _Optional[_Iterable[_Union[ScriptMetadataResponse, _Mapping]]] = ...) -> None: ...

class ScriptMetadataResponse(_message.Message):
    __slots__ = ("project_name", "absolute_path", "metadata", "parameters", "error_message")
    PROJECT_NAME_FIELD_NUMBER: _ClassVar[int]
    ABSOLUTE_PATH_FIELD_NUMBER: _ClassVar[int]
    METADATA_FIELD_NUMBER: _ClassVar[int]
    PARAMETERS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    project_name: str
    absolute_path: str
    metadata: ScriptMetadata
    parameters: _containers.RepeatedCompositeFieldContainer[ScriptParameter]
    error_message: str
    def __init__(self, project_name: _Optional[str] = ..., absolute_path: _Optional[str] = ..., metadata: _Optional[_Union[ScriptMetadata, _Mapping]] = ..., parameters: _Optional[_Iterable[_Union[ScriptParameter, _Mapping]]] = ..., error_message: _Optional[str] = ...) -> None: ...

class GetCombinedScriptRequest(_message.Message):
    __slots__ = ("script_files", "script_path")
    SCRIPT_FILES_FIELD_NUMBER: _ClassVar[int]
    SCRIPT_PATH_FIELD_NUMBER: _ClassVar[int]
    script_files: _containers.RepeatedCompositeFieldContainer[ScriptFile]
    script_path: str
    def __init__(self, script_files: _Optional[_Iterable[_Union[ScriptFile, _Mapping]]] = ..., script_path: _Optional[str] = ...) -> None: ...

class GetCombinedScriptResponse(_message.Message):
    __slots__ = ("combined_script", "error_message")
    COMBINED_SCRIPT_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    combined_script: str
    error_message: str
    def __init__(self, combined_script: _Optional[str] = ..., error_message: _Optional[str] = ...) -> None: ...

class GetContextRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetContextResponse(_message.Message):
    __slots__ = ("active_view_name", "selection_count", "selected_element_ids", "project_info", "active_view_type", "active_view_scale", "active_view_detail_level", "selected_elements", "levels")
    ACTIVE_VIEW_NAME_FIELD_NUMBER: _ClassVar[int]
    SELECTION_COUNT_FIELD_NUMBER: _ClassVar[int]
    SELECTED_ELEMENT_IDS_FIELD_NUMBER: _ClassVar[int]
    PROJECT_INFO_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_VIEW_TYPE_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_VIEW_SCALE_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_VIEW_DETAIL_LEVEL_FIELD_NUMBER: _ClassVar[int]
    SELECTED_ELEMENTS_FIELD_NUMBER: _ClassVar[int]
    LEVELS_FIELD_NUMBER: _ClassVar[int]
    active_view_name: str
    selection_count: int
    selected_element_ids: _containers.RepeatedScalarFieldContainer[int]
    project_info: ProjectInfo
    active_view_type: str
    active_view_scale: int
    active_view_detail_level: str
    selected_elements: _containers.RepeatedCompositeFieldContainer[ElementInfo]
    levels: _containers.RepeatedCompositeFieldContainer[LevelInfo]
    def __init__(self, active_view_name: _Optional[str] = ..., selection_count: _Optional[int] = ..., selected_element_ids: _Optional[_Iterable[int]] = ..., project_info: _Optional[_Union[ProjectInfo, _Mapping]] = ..., active_view_type: _Optional[str] = ..., active_view_scale: _Optional[int] = ..., active_view_detail_level: _Optional[str] = ..., selected_elements: _Optional[_Iterable[_Union[ElementInfo, _Mapping]]] = ..., levels: _Optional[_Iterable[_Union[LevelInfo, _Mapping]]] = ...) -> None: ...

class LevelInfo(_message.Message):
    __slots__ = ("id", "name", "elevation")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    ELEVATION_FIELD_NUMBER: _ClassVar[int]
    id: int
    name: str
    elevation: float
    def __init__(self, id: _Optional[int] = ..., name: _Optional[str] = ..., elevation: _Optional[float] = ...) -> None: ...

class ElementInfo(_message.Message):
    __slots__ = ("id", "category")
    ID_FIELD_NUMBER: _ClassVar[int]
    CATEGORY_FIELD_NUMBER: _ClassVar[int]
    id: int
    category: str
    def __init__(self, id: _Optional[int] = ..., category: _Optional[str] = ...) -> None: ...

class ProjectInfo(_message.Message):
    __slots__ = ("name", "number", "title", "file_path", "is_workshared", "username")
    NAME_FIELD_NUMBER: _ClassVar[int]
    NUMBER_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    FILE_PATH_FIELD_NUMBER: _ClassVar[int]
    IS_WORKSHARED_FIELD_NUMBER: _ClassVar[int]
    USERNAME_FIELD_NUMBER: _ClassVar[int]
    name: str
    number: str
    title: str
    file_path: str
    is_workshared: bool
    username: str
    def __init__(self, name: _Optional[str] = ..., number: _Optional[str] = ..., title: _Optional[str] = ..., file_path: _Optional[str] = ..., is_workshared: bool = ..., username: _Optional[str] = ...) -> None: ...

class GetScriptManifestRequest(_message.Message):
    __slots__ = ("script_path",)
    SCRIPT_PATH_FIELD_NUMBER: _ClassVar[int]
    script_path: str
    def __init__(self, script_path: _Optional[str] = ...) -> None: ...

class GetScriptManifestResponse(_message.Message):
    __slots__ = ("manifest_json", "error_message")
    MANIFEST_JSON_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    manifest_json: str
    error_message: str
    def __init__(self, manifest_json: _Optional[str] = ..., error_message: _Optional[str] = ...) -> None: ...

class ValidateWorkingSetRequest(_message.Message):
    __slots__ = ("element_ids",)
    ELEMENT_IDS_FIELD_NUMBER: _ClassVar[int]
    element_ids: _containers.RepeatedScalarFieldContainer[int]
    def __init__(self, element_ids: _Optional[_Iterable[int]] = ...) -> None: ...

class ValidateWorkingSetResponse(_message.Message):
    __slots__ = ("valid_element_ids",)
    VALID_ELEMENT_IDS_FIELD_NUMBER: _ClassVar[int]
    valid_element_ids: _containers.RepeatedScalarFieldContainer[int]
    def __init__(self, valid_element_ids: _Optional[_Iterable[int]] = ...) -> None: ...

class ComputeParameterOptionsRequest(_message.Message):
    __slots__ = ("script_content", "parameter_name", "parameters_json")
    SCRIPT_CONTENT_FIELD_NUMBER: _ClassVar[int]
    PARAMETER_NAME_FIELD_NUMBER: _ClassVar[int]
    PARAMETERS_JSON_FIELD_NUMBER: _ClassVar[int]
    script_content: str
    parameter_name: str
    parameters_json: bytes
    def __init__(self, script_content: _Optional[str] = ..., parameter_name: _Optional[str] = ..., parameters_json: _Optional[bytes] = ...) -> None: ...

class ComputeParameterOptionsResponse(_message.Message):
    __slots__ = ("options", "is_success", "error_message", "min", "max", "step")
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    MIN_FIELD_NUMBER: _ClassVar[int]
    MAX_FIELD_NUMBER: _ClassVar[int]
    STEP_FIELD_NUMBER: _ClassVar[int]
    options: _containers.RepeatedScalarFieldContainer[str]
    is_success: bool
    error_message: str
    min: float
    max: float
    step: float
    def __init__(self, options: _Optional[_Iterable[str]] = ..., is_success: bool = ..., error_message: _Optional[str] = ..., min: _Optional[float] = ..., max: _Optional[float] = ..., step: _Optional[float] = ...) -> None: ...

class RenameScriptRequest(_message.Message):
    __slots__ = ("old_path", "new_name")
    OLD_PATH_FIELD_NUMBER: _ClassVar[int]
    NEW_NAME_FIELD_NUMBER: _ClassVar[int]
    old_path: str
    new_name: str
    def __init__(self, old_path: _Optional[str] = ..., new_name: _Optional[str] = ...) -> None: ...

class RenameScriptResponse(_message.Message):
    __slots__ = ("is_success", "new_path", "error_message")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    NEW_PATH_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    new_path: str
    error_message: str
    def __init__(self, is_success: bool = ..., new_path: _Optional[str] = ..., error_message: _Optional[str] = ...) -> None: ...

class BuildScriptRequest(_message.Message):
    __slots__ = ("script_content",)
    SCRIPT_CONTENT_FIELD_NUMBER: _ClassVar[int]
    script_content: str
    def __init__(self, script_content: _Optional[str] = ...) -> None: ...

class BuildScriptResponse(_message.Message):
    __slots__ = ("is_success", "compiled_assembly", "error_message")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    COMPILED_ASSEMBLY_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    compiled_assembly: bytes
    error_message: str
    def __init__(self, is_success: bool = ..., compiled_assembly: _Optional[bytes] = ..., error_message: _Optional[str] = ...) -> None: ...

class ParameterUpdateItem(_message.Message):
    __slots__ = ("element_id", "parameter_name", "new_value_string", "unit")
    ELEMENT_ID_FIELD_NUMBER: _ClassVar[int]
    PARAMETER_NAME_FIELD_NUMBER: _ClassVar[int]
    NEW_VALUE_STRING_FIELD_NUMBER: _ClassVar[int]
    UNIT_FIELD_NUMBER: _ClassVar[int]
    element_id: int
    parameter_name: str
    new_value_string: str
    unit: str
    def __init__(self, element_id: _Optional[int] = ..., parameter_name: _Optional[str] = ..., new_value_string: _Optional[str] = ..., unit: _Optional[str] = ...) -> None: ...

class BatchUpdateElementParametersRequest(_message.Message):
    __slots__ = ("updates",)
    UPDATES_FIELD_NUMBER: _ClassVar[int]
    updates: _containers.RepeatedCompositeFieldContainer[ParameterUpdateItem]
    def __init__(self, updates: _Optional[_Iterable[_Union[ParameterUpdateItem, _Mapping]]] = ...) -> None: ...

class BatchUpdateElementParametersResponse(_message.Message):
    __slots__ = ("is_success", "error_message", "count")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    error_message: str
    count: int
    def __init__(self, is_success: bool = ..., error_message: _Optional[str] = ..., count: _Optional[int] = ...) -> None: ...

class UpdateElementParameterRequest(_message.Message):
    __slots__ = ("element_id", "parameter_name", "new_value_string", "unit")
    ELEMENT_ID_FIELD_NUMBER: _ClassVar[int]
    PARAMETER_NAME_FIELD_NUMBER: _ClassVar[int]
    NEW_VALUE_STRING_FIELD_NUMBER: _ClassVar[int]
    UNIT_FIELD_NUMBER: _ClassVar[int]
    element_id: int
    parameter_name: str
    new_value_string: str
    unit: str
    def __init__(self, element_id: _Optional[int] = ..., parameter_name: _Optional[str] = ..., new_value_string: _Optional[str] = ..., unit: _Optional[str] = ...) -> None: ...

class UpdateElementParameterResponse(_message.Message):
    __slots__ = ("is_success", "error_message")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    error_message: str
    def __init__(self, is_success: bool = ..., error_message: _Optional[str] = ...) -> None: ...

class ExecuteReplRequest(_message.Message):
    __slots__ = ("code", "session_id", "license_tier", "execution_mode", "source")
    CODE_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    LICENSE_TIER_FIELD_NUMBER: _ClassVar[int]
    EXECUTION_MODE_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FIELD_NUMBER: _ClassVar[int]
    code: str
    session_id: str
    license_tier: str
    execution_mode: str
    source: str
    def __init__(self, code: _Optional[str] = ..., session_id: _Optional[str] = ..., license_tier: _Optional[str] = ..., execution_mode: _Optional[str] = ..., source: _Optional[str] = ...) -> None: ...

class ExecuteReplResponse(_message.Message):
    __slots__ = ("is_success", "output", "error_message", "structured_output", "pipeline_diagnostics", "user_rejected", "read_only_violation")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    STRUCTURED_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    PIPELINE_DIAGNOSTICS_FIELD_NUMBER: _ClassVar[int]
    USER_REJECTED_FIELD_NUMBER: _ClassVar[int]
    READ_ONLY_VIOLATION_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    output: str
    error_message: str
    structured_output: _containers.RepeatedCompositeFieldContainer[StructuredOutputItem]
    pipeline_diagnostics: _containers.RepeatedScalarFieldContainer[int]
    user_rejected: bool
    read_only_violation: bool
    def __init__(self, is_success: bool = ..., output: _Optional[str] = ..., error_message: _Optional[str] = ..., structured_output: _Optional[_Iterable[_Union[StructuredOutputItem, _Mapping]]] = ..., pipeline_diagnostics: _Optional[_Iterable[int]] = ..., user_rejected: bool = ..., read_only_violation: bool = ...) -> None: ...
