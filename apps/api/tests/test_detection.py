import pytest

from app.detection import list_detection_scripts, validate_detection_script


def test_only_camera_detection_scripts_are_allowlisted() -> None:
    scripts = list_detection_scripts()
    assert "Tset118aug.py" in scripts
    assert "Test19Agus_optimized_fps_big_ui.py" in scripts
    assert "Tsetyolo.py" not in scripts
    assert all(name.startswith(("Test", "Tset")) and name.endswith(".py") for name in scripts)


def test_rejects_arbitrary_script_execution() -> None:
    with pytest.raises(ValueError):
        validate_detection_script("../../dangerous.py")
