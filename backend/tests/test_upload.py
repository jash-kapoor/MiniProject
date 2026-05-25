import pytest

def test_transcribe_invalid_mime_type(client, auth_headers):
    response = client.post(
        "/transcribe",
        files={"file": ("test.webm", b"dummy content", "text/plain")},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "Unsupported audio MIME type" in response.json()["detail"]

def test_transcribe_invalid_extension(client, auth_headers):
    response = client.post(
        "/transcribe",
        files={"file": ("test.txt", b"dummy content", "audio/webm")},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "Unsupported audio file extension" in response.json()["detail"]

def test_transcribe_empty_file(client, auth_headers):
    response = client.post(
        "/transcribe",
        files={"file": ("test.webm", b"", "audio/webm")},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "Empty audio file" in response.json()["detail"]

def test_transcribe_large_file(client, auth_headers, monkeypatch):
    # Mock settings.max_upload_size_mb to be 1 MB for testing
    from config import settings
    monkeypatch.setattr(settings, "max_upload_size_mb", 1)
    large_content = b"a" * (2 * 1024 * 1024) # 2 MB
    
    response = client.post(
        "/transcribe",
        files={"file": ("test.webm", large_content, "audio/webm")},
        headers=auth_headers,
    )
    assert response.status_code == 413
    assert "exceeds" in response.json()["detail"]
