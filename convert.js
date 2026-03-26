const fs = require('fs');
const { execSync } = require('child_process');

console.log("Fetching npx marked and converting Markdown to HTML...");
const htmlBody = execSync('npx -y marked --gfm Paracore-Pitch.md', { encoding: 'utf8' });

const finalHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Paracore Pitch</title>
    <style>
        body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 900px; 
            margin: 0 auto; 
            padding: 40px; 
        }
        h1, h2, h3 { color: #2c3e50; }
        h1 { border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 40px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f8f9fa; font-weight: bold; }
        tr:nth-child(even) { background-color: #fdfdfd; }
        a { color: #3498db; text-decoration: none; }
        code { background-color: #f1f1f1; padding: 2px 5px; border-radius: 4px; font-family: Consolas, monospace; }
    </style>
</head>
<body>
    ${htmlBody}
</body>
</html>
`;

fs.writeFileSync('Paracore-Pitch.html', finalHtml, 'utf8');
console.log("Success! Paracore-Pitch.html has been generated natively with beautiful styling.");
