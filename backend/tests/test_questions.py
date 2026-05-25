def test_get_questions_public(client):
    """Questions endpoint should be accessible without auth."""
    response = client.get("/questions/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_create_question_as_hr(client, hr_headers):
    response = client.post(
        "/questions/",
        json={"text": "What is polymorphism?", "category": "technical", "difficulty": "hard"},
        headers=hr_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["text"] == "What is polymorphism?"
    assert data["category"] == "technical"


def test_create_question_as_candidate(client, auth_headers):
    response = client.post(
        "/questions/",
        json={"text": "Some question"},
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_delete_question_as_hr(client, hr_headers):
    # Create first
    create_res = client.post(
        "/questions/",
        json={"text": "To delete"},
        headers=hr_headers,
    )
    q_id = create_res.json()["id"]

    # Delete
    del_res = client.delete(f"/questions/{q_id}", headers=hr_headers)
    assert del_res.status_code == 200

    # Verify gone
    all_q = client.get("/questions/").json()
    assert not any(q["id"] == q_id for q in all_q)
