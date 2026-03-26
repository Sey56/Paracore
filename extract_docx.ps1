$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open('C:\Users\seyou\Paracore\Revit Pain Points.docx')
$doc.Content.Text | Out-File -FilePath 'C:\Users\seyou\Paracore\Revit_Pain_Points.txt' -Encoding UTF8
$doc.Close()
$word.Quit()
Write-Host 'Done'
