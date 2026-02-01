from pathlib import Path

import markdown

md_file_path = "AboutParacore.md"
html_file_path = "AboutParacore.html"

# Read the Markdown content
md_content = Path(md_file_path).read_text(encoding="utf-8")

# Convert Markdown to HTML
html_content = markdown.markdown(
    md_content,
    extensions=['fenced_code', 'tables', 'attr_list', 'nl2br'], # Common extensions
    extension_configs={
        'attr_list': {},
        'fenced_code': {
            'lang_prefix': 'language-'
        }
    }
)

# Add a basic HTML structure and some inline styling for better presentation
final_html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>About Paracore</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.1.0/github-markdown.min.css">
    <style>
        .markdown-body {{
            box-sizing: border-box;
            min-width: 200px;
            max-width: 980px;
            margin: 0 auto;
            padding: 45px;
        }}
        @media (max-width: 767px) {{
            .markdown-body {{
                padding: 15px;
            }}
        }}
        /* Basic emoji styling for better visibility across systems */
        .markdown-body img.emoji {{
            height: 1.2em;
            width: 1.2em;
            margin: 0 .05em 0 .1em;
            vertical-align: -0.1em;
        }}
    </style>
</head>
<body class="markdown-body">
    {html_content}
</body>
</html>
"""

# Write the HTML content to a file
Path(html_file_path).write_text(final_html, encoding="utf-8")

print(f"'{md_file_path}' successfully converted to '{html_file_path}'")

