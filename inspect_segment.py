from pathlib import Path
text = Path('public/secure-admin-dashboard.html').read_text(encoding='utf-8')
start = text.index('<!-- Row: Quick Actions / Counters (kept on Dashboard) -->')
end = text.index('</div><!-- /tab-dashboard -->', start)
segment = text[start:end]
print(segment.count('\r\n'))
print(repr(segment[-20:]))
