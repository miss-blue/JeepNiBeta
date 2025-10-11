"""
Convenience entry point so `python main.py` from the repository root starts the
Flask backend (and its prediction scheduler) exactly like running
`python backend/main.py`.
"""

from pathlib import Path
from runpy import run_path


def main() -> None:
    backend_main = Path(__file__).resolve().parent / "backend" / "main.py"
    run_path(str(backend_main), run_name="__main__")


if __name__ == "__main__":
    main()
