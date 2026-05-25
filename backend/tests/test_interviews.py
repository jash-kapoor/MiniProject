def test_create_interview(client, auth_headers):
    response = client.post(
        "/interviews/",
        json={"job_title": "Test Engineer"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["job_title"] == "Test Engineer"
    assert data["status"] == "pending"


def test_create_interview_no_auth(client):
    response = client.post(
        "/interviews/",
        json={"job_title": "Test Engineer"},
    )
    assert response.status_code == 401


def test_get_interviews_all_as_hr(client, hr_headers, auth_headers):
    """HR should access /interviews/all."""
    # Create an interview as candidate first
    client.post("/interviews/", json={"job_title": "Dev"}, headers=auth_headers)
    response = client.get("/interviews/all", headers=hr_headers)
    assert response.status_code == 200
    assert "items" in response.json()


def test_get_interviews_all_as_candidate(client, auth_headers):
    """Candidates should NOT access /interviews/all."""
    response = client.get("/interviews/all", headers=auth_headers)
    assert response.status_code == 403


def test_export_dataset_as_hr(client, hr_headers):
    response = client.get("/export-dataset", headers=hr_headers)
    assert response.status_code == 200


def test_export_dataset_as_candidate(client, auth_headers):
    response = client.get("/export-dataset", headers=auth_headers)
    assert response.status_code == 403
