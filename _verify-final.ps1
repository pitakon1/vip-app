$f = 'e:\work\app\vip app\rental-full\pages\tenant-documents.html'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

# --- Head integrity (copied verbatim from owner-dashboard, only title changed) ---
"themeVars=$($c -match 'id=\"theme-vars\"')"
"tailwindScript=$($c -match '@tailwindcss/browser')"
"lucideLib=$($c -match 'lucide@')"
"themeInline=$($c -match '@theme inline')"
"semFallback=$($c -match 'id=\"semantic-token-fallback\"')"
"rentComponents=$($c -match 'id=\"rent-components\"')"
"noScrollbar=$($c -match 'no-scrollbar')"

# --- Title ---
$titleMatch = [regex]::Match($c, '<title>[^<]*</title>').Value
("title=" + $titleMatch)

# --- Body + lucide ---
"bodyClass=$($c -match '<body class=\"min-h-screen font-sans antialiased\">')"
"lucideBeforeBody=$($c -match 'lucide\.createIcons\(\);\s*</script>\s*</body>')"

# --- Active nav ---
$navLine = ($c -split "`r?`n" | Where-Object { $_ -match 'nav-tenant-documents' })
"navLineHasActive=$($navLine -match 'data-active=\"true\"')"
"activeTrueCount=$([regex]::Matches($c, 'data-active=\"true\"').Count)"

# --- domIds ---
"domIds=" + (([regex]::Matches($c, 'data-dom-id=\"([^\"]+)\"') | ForEach-Object { $_.Groups[1].Value }) -join ',')

# --- Content sections ---
"tabsCount=$([regex]::Matches($c, 'class=\"rent-tab\"').Count)"
"statValueBodyCount=$([regex]::Matches($c, 'class=\"rent-stat-card__value\"').Count)"
"tableHeaderCells=$([regex]::Matches($c, '<th>').Count)"
"tableBodyRows=$([regex]::Matches($c, '<tr>').Count)"
"paginationPresent=$($c -match 'rent-flex--between rent-mt-5')"
"uploadBtnId=$($c -match 'data-dom-id=\"btn-upload-doc\"')"

# --- No owner residue ---
"ownerNavResidue=$($c -match 'data-nav-key=\"owner')"
"ownerBrandResidue=$($c -match 'RentFlow ')"

# --- Structure ---
"openDiv=$([regex]::Matches($c, '<div\b').Count) closeDiv=$([regex]::Matches($c, '</div>').Count)"
"hasMain=$($c -match '</main>') hasHtml=$($c -match '</html>')"

# --- Cleanup temp scripts ---
Remove-Item 'e:\work\app\vip app\_strip-owner.ps1','e:\work\app\vip app\_fix-indent.ps1','e:\work\app\vip app\_fix-indent2.ps1' -Force -ErrorAction SilentlyContinue
"cleanupDone=$(-not (Test-Path 'e:\work\app\vip app\_strip-owner.ps1') -and -not (Test-Path 'e:\work\app\vip app\_fix-indent2.ps1'))"
