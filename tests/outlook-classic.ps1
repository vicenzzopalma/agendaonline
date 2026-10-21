param([string]$FixtureDirectory = (Join-Path $PSScriptRoot '..\outputs\invitations'))
$ErrorActionPreference = 'Stop'
# Inspect QA fixtures only. Never use GetAssociatedAppointment: Outlook can
# materialize a tentative calendar item even with AddToCalendar=False.
# Read MAPI properties; never display, save, resolve, respond, or send.
$fixtureRoot = [System.IO.Path]::GetFullPath($FixtureDirectory)
$outlookQa = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
$namespaceQa = $outlookQa.GetNamespace('MAPI')
$reportsQa = @()
$uidQa = [guid]::NewGuid().ToString() + '@agenda.realess'
$nativeRootQa = Join-Path $fixtureRoot 'outlook-read-test'
[void][System.IO.Directory]::CreateDirectory($nativeRootQa)
$propertyBaseQa = 'http://schemas.microsoft.com/mapi/id/{00062002-0000-0000-C000-000000000046}/'
try {
  foreach ($filenameQa in @('chrome-request.ics', 'chrome-update.ics', 'chrome-cancel.ics')) {
    $pathQa = Join-Path $fixtureRoot $filenameQa
    $rawQa = [System.IO.File]::ReadAllText($pathQa).Replace("`r`n ", '')
    if ($rawQa -notmatch 'SUMMARY:QA convite Chrome') { throw 'Only generated QA fixtures may be opened.' }
    # Repeated tests need a fresh UID to avoid Outlook's iTIP version cache.
    # Preserve one common UID across request, update and cancellation.
    $nativeContentQa = [regex]::Replace([System.IO.File]::ReadAllText($pathQa), '(?m)^UID:[^\r\n]+', ('UID:' + $uidQa))
    $pathQa = Join-Path $nativeRootQa $filenameQa
    [System.IO.File]::WriteAllText($pathQa, $nativeContentQa, (New-Object System.Text.UTF8Encoding($false)))
    $itemQa = $null
    $accessorQa = $null
    try {
      $itemQa = $namespaceQa.OpenSharedItem($pathQa)
      if ($itemQa.Subject -notlike 'QA convite Chrome*') { throw 'Title mismatch.' }
      $accessorQa = $itemQa.PropertyAccessor
      # PowerShell COM marshals these PT_SYSTIME values as local DateTime.
      $startQa = $accessorQa.GetProperty($propertyBaseQa + '0x820D0040').ToUniversalTime()
      $endQa = $accessorQa.GetProperty($propertyBaseQa + '0x820E0040').ToUniversalTime()
      $locationQa = $accessorQa.GetProperty($propertyBaseQa + '0x8208001F')
      $expectedHourQa = if ($filenameQa -eq 'chrome-request.ics') { 12 } else { 14 }
      if ($startQa.Year -ne 2026 -or $startQa.Month -ne 10 -or $startQa.Day -ne 22 -or $startQa.Hour -ne $expectedHourQa) { throw "Start UTC mismatch for $filenameQa" }
      if ($endQa -le $startQa) { throw 'End time mismatch.' }
      $expectedClassQa = if ($filenameQa -eq 'chrome-cancel.ics') { 'IPM.Schedule.Meeting.Canceled' } else { 'IPM.Schedule.Meeting.Request' }
      if ($itemQa.MessageClass -ne $expectedClassQa) { throw 'Meeting method mismatch.' }
      if ($locationQa -ne 'Google Meet') { throw 'Location mismatch.' }
      if ($itemQa.Recipients.Count -lt 2) { throw 'Missing recipients.' }
      $reportsQa += [pscustomobject]@{
        File = $filenameQa; OutlookVersion = $outlookQa.Version; Parsed = $true
        StartUTC = $startQa.ToString('yyyy-MM-ddTHH:mm:ss')
        EndUTC = $endQa.ToString('yyyy-MM-ddTHH:mm:ss')
        RecipientCount = $itemQa.Recipients.Count; MessageClass = $itemQa.MessageClass
        SavedByTest = $false; Sent = $false
        NativeFixtureUsesFreshQAUID = $true
      }
    } finally {
      if ($null -ne $accessorQa) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($accessorQa) }
      if ($null -ne $itemQa) {
        $itemQa.Close(1)
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($itemQa)
      }
    }
  }
  $jsonQa = $reportsQa | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText((Join-Path $fixtureRoot 'outlook-classic-report.json'), $jsonQa, (New-Object System.Text.UTF8Encoding($false)))
  $jsonQa
} finally {
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($namespaceQa)
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($outlookQa)
}
