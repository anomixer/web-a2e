import os
import time

# Configuration
SOURCE = ".claude/summary/SUMMARY.md"
ARCHIVE_DIR = ".claude/summary"

if os.path.exists(SOURCE):
    # 1. Read content for Claude's hook
    with open(SOURCE, 'r') as f:
        print(f.read())

    # 2. Ensure archive directory exists
    if not os.path.exists(ARCHIVE_DIR):
        os.makedirs(ARCHIVE_DIR)

    # 3. Rename with timestamp (e.g., SUMMARY_20231027_1230.md)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    archive_name = os.path.join(ARCHIVE_DIR, f"SUMMARY_{timestamp}.md")

    os.rename(SOURCE, archive_name)
    print(f"\n[Archived: {archive_name}]")
else:
    print(f"[No summary file found at {SOURCE}]")
