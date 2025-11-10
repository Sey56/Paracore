from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class GetScriptManifestRequest(_message.Message):
    __slots__ = ("agent_scripts_path",)
    AGENT_SCRIPTS_PATH_FIELD_NUMBER: _ClassVar[int]
    agent_scripts_path: str
    def __init__(self, agent_scripts_path: _Optional[str] = ...) -> None: ...

class Empty(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

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

class OutputSummary(_message.Message):
    __slots__ = ("type", "message", "table", "console", "return_value_summary")
    TYPE_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    TABLE_FIELD_NUMBER: _ClassVar[int]
    CONSOLE_FIELD_NUMBER: _ClassVar[int]
    RETURN_VALUE_SUMMARY_FIELD_NUMBER: _ClassVar[int]
    type: str
    message: str
    table: TableSummary
    console: ConsoleSummary
    return_value_summary: ReturnValueSummary
    def __init__(self, type: _Optional[str] = ..., message: _Optional[str] = ..., table: _Optional[_Union[TableSummary, _Mapping]] = ..., console: _Optional[_Union[ConsoleSummary, _Mapping]] = ..., return_value_summary: _Optional[_Union[ReturnValueSummary, _Mapping]] = ...) -> None: ...

class TableSummary(_message.Message):
    __slots__ = ("row_count", "column_headers", "truncated_rows_json")
    ROW_COUNT_FIELD_NUMBER: _ClassVar[int]
    COLUMN_HEADERS_FIELD_NUMBER: _ClassVar[int]
    TRUNCATED_ROWS_JSON_FIELD_NUMBER: _ClassVar[int]
    row_count: int
    column_headers: _containers.RepeatedScalarFieldContainer[str]
    truncated_rows_json: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, row_count: _Optional[int] = ..., column_headers: _Optional[_Iterable[str]] = ..., truncated_rows_json: _Optional[_Iterable[str]] = ...) -> None: ...

class ConsoleSummary(_message.Message):
    __slots__ = ("line_count", "truncated_lines")
    LINE_COUNT_FIELD_NUMBER: _ClassVar[int]
    TRUNCATED_LINES_FIELD_NUMBER: _ClassVar[int]
    line_count: int
    truncated_lines: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, line_count: _Optional[int] = ..., truncated_lines: _Optional[_Iterable[str]] = ...) -> None: ...

class ReturnValueSummary(_message.Message):
    __slots__ = ("type", "value")
    TYPE_FIELD_NUMBER: _ClassVar[int]
    VALUE_FIELD_NUMBER: _ClassVar[int]
    type: str
    value: str
    def __init__(self, type: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...

class ExecuteScriptResponse(_message.Message):
    __slots__ = ("is_success", "output", "error_message", "error_details", "structured_output", "output_summary")
    IS_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    ERROR_DETAILS_FIELD_NUMBER: _ClassVar[int]
    STRUCTURED_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_SUMMARY_FIELD_NUMBER: _ClassVar[int]
    is_success: bool
    output: str
    error_message: str
    error_details: _containers.RepeatedScalarFieldContainer[str]
    structured_output: _containers.RepeatedCompositeFieldContainer[StructuredOutputItem]
    output_summary: OutputSummary
    def __init__(self, is_success: bool = ..., output: _Optional[str] = ..., error_message: _Optional[str] = ..., error_details: _Optional[_Iterable[str]] = ..., structured_output: _Optional[_Iterable[_Union[StructuredOutputItem, _Mapping]]] = ..., output_summary: _Optional[_Union[OutputSummary, _Mapping]] = ...) -> None: ...

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

class ScriptManifestResponse(_message.Message):
    __slots__ = ("scripts", "error_message")
    SCRIPTS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    scripts: _containers.RepeatedCompositeFieldContainer[ScriptMetadata]
    error_message: str
    def __init__(self, scripts: _Optional[_Iterable[_Union[ScriptMetadata, _Mapping]]] = ..., error_message: _Optional[str] = ...) -> None: ...

class GetScriptParametersResponse(_message.Message):
    __slots__ = ("parameters", "error_message")
    PARAMETERS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    parameters: _containers.RepeatedCompositeFieldContainer[ScriptParameter]
    error_message: str
    def __init__(self, parameters: _Optional[_Iterable[_Union[ScriptParameter, _Mapping]]] = ..., error_message: _Optional[str] = ...) -> None: ...

class ScriptParameter(_message.Message):
    __slots__ = ("name", "type", "default_value_json", "description", "options")
    NAME_FIELD_NUMBER: _ClassVar[int]
    TYPE_FIELD_NUMBER: _ClassVar[int]
    DEFAULT_VALUE_JSON_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    name: str
    type: str
    default_value_json: str
    description: str
    options: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, name: _Optional[str] = ..., type: _Optional[str] = ..., default_value_json: _Optional[str] = ..., description: _Optional[str] = ..., options: _Optional[_Iterable[str]] = ...) -> None: ...

class GetCombinedScriptRequest(_message.Message):
    __slots__ = ("script_files",)
    SCRIPT_FILES_FIELD_NUMBER: _ClassVar[int]
    script_files: _containers.RepeatedCompositeFieldContainer[ScriptFile]
    def __init__(self, script_files: _Optional[_Iterable[_Union[ScriptFile, _Mapping]]] = ...) -> None: ...

class GetCombinedScriptResponse(_message.Message):
    __slots__ = ("combined_script", "error_message")
    COMBINED_SCRIPT_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    combined_script: str
    error_message: str
    def __init__(self, combined_script: _Optional[str] = ..., error_message: _Optional[str] = ...) -> None: ...
