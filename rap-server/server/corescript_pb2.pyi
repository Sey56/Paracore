from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class CreateWorkspaceRequest(_message.Message):
    __slots__ = ("script_path", "script_type")
    SCRIPT_PATH_FIELD_NUMBER: _ClassVar[int]
    SCRIPT_TYPE_FIELD_NUMBER: _ClassVar[int]
    script_path: str
    script_type: str
    def __init__(self, script_path: _Optional[str] = ..., script_type: _Optional[str] = ...) -> None: ...

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
    __slots__ = ("script_content", "parameters_json", "source")
    SCRIPT_CONTENT_FIELD_NUMBER: _ClassVar[int]
    PARAMETERS_JSON_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FIELD_NUMBER: _ClassVar[int]
    script_content: str
    parameters_json: bytes
    source: str
    def __init__(self, script_content: _Optional[str] = ..., parameters_json: _Optional[bytes] = ..., source: _Optional[str] = ...) -> None: ...

class StructuredOutputItem(_message.Message):
    __slots__ = ("type", "data")
    TYPE_FIELD_NUMBER: _ClassVar[int]
    DATA_FIELD_NUMBER: _ClassVar[int]
    type: str
    data: str
    def __init__(self, type: _Optional[str] = ..., data: _Optional[str] = ...) -> None: ...

class ExecuteScriptResponse(_message.Message):
    __slots__ = ("is_success", "output", "error_message", "error_details", "structured_output", "internal_data", "agent_summary")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    ERROR_DETAILS_FIELD_NUMBER: _ClassVar[int]
    STRUCTURED_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    INTERNAL_DATA_FIELD_NUMBER: _ClassVar[int]
    AGENT_SUMMARY_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    output: str
    error_message: str
    error_details: _containers.RepeatedScalarFieldContainer[str]
    structured_output: _containers.RepeatedCompositeFieldContainer[StructuredOutputItem]
    internal_data: str
    agent_summary: str
    def __init__(self, is_success: bool = ..., output: _Optional[str] = ..., error_message: _Optional[str] = ..., error_details: _Optional[_Iterable[str]] = ..., structured_output: _Optional[_Iterable[_Union[StructuredOutputItem, _Mapping]]] = ..., internal_data: _Optional[str] = ..., agent_summary: _Optional[str] = ...) -> None: ...

class GetStatusRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetStatusResponse(_message.Message):
    __slots__ = ("rserver_connected", "revit_open", "revit_version", "document_open", "document_title", "document_type")
    RSERVER_CONNECTED_FIELD_NUMBER: _ClassVar[int]
    REVIT_OPEN_FIELD_NUMBER: _ClassVar[int]
    REVIT_VERSION_FIELD_NUMBER: _ClassVar[int]
    DOCUMENT_OPEN_FIELD_NUMBER: _ClassVar[int]
    DOCUMENT_TITLE_FIELD_NUMBER: _ClassVar[int]
    DOCUMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    rserver_connected: bool
    revit_open: bool
    revit_version: str
    document_open: bool
    document_title: str
    document_type: str
    def __init__(self, rserver_connected: bool = ..., revit_open: bool = ..., revit_version: _Optional[str] = ..., document_open: bool = ..., document_title: _Optional[str] = ..., document_type: _Optional[str] = ...) -> None: ...

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
    __slots__ = ("name", "file_path", "script_type", "description", "author", "categories", "dependencies", "document_type", "usage_examples", "website", "last_run")
    NAME_FIELD_NUMBER: _ClassVar[int]
    FILE_PATH_FIELD_NUMBER: _ClassVar[int]
    SCRIPT_TYPE_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    AUTHOR_FIELD_NUMBER: _ClassVar[int]
    CATEGORIES_FIELD_NUMBER: _ClassVar[int]
    DEPENDENCIES_FIELD_NUMBER: _ClassVar[int]
    DOCUMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    USAGE_EXAMPLES_FIELD_NUMBER: _ClassVar[int]
    WEBSITE_FIELD_NUMBER: _ClassVar[int]
    LAST_RUN_FIELD_NUMBER: _ClassVar[int]
    name: str
    file_path: str
    script_type: str
    description: str
    author: str
    categories: _containers.RepeatedScalarFieldContainer[str]
    dependencies: _containers.RepeatedScalarFieldContainer[str]
    document_type: str
    usage_examples: _containers.RepeatedScalarFieldContainer[str]
    website: str
    last_run: str
    def __init__(self, name: _Optional[str] = ..., file_path: _Optional[str] = ..., script_type: _Optional[str] = ..., description: _Optional[str] = ..., author: _Optional[str] = ..., categories: _Optional[_Iterable[str]] = ..., dependencies: _Optional[_Iterable[str]] = ..., document_type: _Optional[str] = ..., usage_examples: _Optional[_Iterable[str]] = ..., website: _Optional[str] = ..., last_run: _Optional[str] = ...) -> None: ...

class GetScriptParametersResponse(_message.Message):
    __slots__ = ("parameters", "error_message")
    PARAMETERS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    parameters: _containers.RepeatedCompositeFieldContainer[ScriptParameter]
    error_message: str
    def __init__(self, parameters: _Optional[_Iterable[_Union[ScriptParameter, _Mapping]]] = ..., error_message: _Optional[str] = ...) -> None: ...

class ScriptParameter(_message.Message):
    __slots__ = ("name", "type", "default_value_json", "description", "options", "multi_select", "visible_when", "numeric_type", "min", "max", "step", "is_revit_element", "revit_element_type", "revit_element_category", "requires_compute", "group")
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
    def __init__(self, name: _Optional[str] = ..., type: _Optional[str] = ..., default_value_json: _Optional[str] = ..., description: _Optional[str] = ..., options: _Optional[_Iterable[str]] = ..., multi_select: bool = ..., visible_when: _Optional[str] = ..., numeric_type: _Optional[str] = ..., min: _Optional[float] = ..., max: _Optional[float] = ..., step: _Optional[float] = ..., is_revit_element: bool = ..., revit_element_type: _Optional[str] = ..., revit_element_category: _Optional[str] = ..., requires_compute: bool = ..., group: _Optional[str] = ...) -> None: ...

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
    __slots__ = ("active_view_name", "selection_count", "selected_element_ids", "project_info", "active_view_type", "active_view_scale", "active_view_detail_level", "selected_elements")
    ACTIVE_VIEW_NAME_FIELD_NUMBER: _ClassVar[int]
    SELECTION_COUNT_FIELD_NUMBER: _ClassVar[int]
    SELECTED_ELEMENT_IDS_FIELD_NUMBER: _ClassVar[int]
    PROJECT_INFO_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_VIEW_TYPE_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_VIEW_SCALE_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_VIEW_DETAIL_LEVEL_FIELD_NUMBER: _ClassVar[int]
    SELECTED_ELEMENTS_FIELD_NUMBER: _ClassVar[int]
    active_view_name: str
    selection_count: int
    selected_element_ids: _containers.RepeatedScalarFieldContainer[int]
    project_info: ProjectInfo
    active_view_type: str
    active_view_scale: int
    active_view_detail_level: str
    selected_elements: _containers.RepeatedCompositeFieldContainer[ElementInfo]
    def __init__(self, active_view_name: _Optional[str] = ..., selection_count: _Optional[int] = ..., selected_element_ids: _Optional[_Iterable[int]] = ..., project_info: _Optional[_Union[ProjectInfo, _Mapping]] = ..., active_view_type: _Optional[str] = ..., active_view_scale: _Optional[int] = ..., active_view_detail_level: _Optional[str] = ..., selected_elements: _Optional[_Iterable[_Union[ElementInfo, _Mapping]]] = ...) -> None: ...

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
    __slots__ = ("script_content", "parameter_name")
    SCRIPT_CONTENT_FIELD_NUMBER: _ClassVar[int]
    PARAMETER_NAME_FIELD_NUMBER: _ClassVar[int]
    script_content: str
    parameter_name: str
    def __init__(self, script_content: _Optional[str] = ..., parameter_name: _Optional[str] = ...) -> None: ...

class ComputeParameterOptionsResponse(_message.Message):
    __slots__ = ("options", "is_success", "error_message")
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    options: _containers.RepeatedScalarFieldContainer[str]
    is_success: bool
    error_message: str
    def __init__(self, options: _Optional[_Iterable[str]] = ..., is_success: bool = ..., error_message: _Optional[str] = ...) -> None: ...
