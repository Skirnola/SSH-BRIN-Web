import pytest

from app.detection import list_detection_scripts, validate_detection_script


def test_only_camera_detection_scripts_are_allowlisted() -> None:
    scripts = list_detection_scripts()
    assert scripts == ["Test19Agus_optimized_fps_big_ui.py"]


def test_rejects_arbitrary_script_execution() -> None:
    for script in ("../../dangerous.py", "Tset118aug.py"):
        with pytest.raises(ValueError):
            validate_detection_script(script)
