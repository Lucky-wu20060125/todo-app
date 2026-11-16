import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from mangum import Mangum

from app.main import app

handler = Mangum(app)
