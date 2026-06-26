import pytest


def test_create_comment(authorized_client, test_posts):
    post_id = test_posts[0].id
    res = authorized_client.post(f"/posts/{post_id}/comments", json={"content": "Nice post!"})
    assert res.status_code == 201
    data = res.json()
    assert data["content"] == "Nice post!"
    assert data["post_id"] == post_id
    assert "owner" in data
    assert data["parent_id"] is None


def test_create_comment_unauthenticated(client, test_posts):
    post_id = test_posts[0].id
    res = client.post(f"/posts/{post_id}/comments", json={"content": "Nice post!"})
    assert res.status_code == 401


def test_create_comment_on_nonexistent_post(authorized_client):
    res = authorized_client.post("/posts/99999/comments", json={"content": "Hello"})
    assert res.status_code == 404


def test_get_comments(authorized_client, test_posts):
    post_id = test_posts[0].id
    authorized_client.post(f"/posts/{post_id}/comments", json={"content": "First comment"})
    authorized_client.post(f"/posts/{post_id}/comments", json={"content": "Second comment"})

    res = authorized_client.get(f"/posts/{post_id}/comments")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2


def test_create_reply(authorized_client, test_posts):
    post_id = test_posts[0].id
    res = authorized_client.post(f"/posts/{post_id}/comments", json={"content": "Parent comment"})
    parent_id = res.json()["id"]

    res2 = authorized_client.post(f"/posts/{post_id}/comments", json={"content": "Reply", "parent_id": parent_id})
    assert res2.status_code == 201
    assert res2.json()["parent_id"] == parent_id


def test_delete_own_comment(authorized_client, test_posts):
    post_id = test_posts[0].id
    res = authorized_client.post(f"/posts/{post_id}/comments", json={"content": "To delete"})
    comment_id = res.json()["id"]

    res2 = authorized_client.delete(f"/comments/{comment_id}")
    assert res2.status_code == 204


def test_delete_others_comment(authorized_client, test_posts, test_user2):
    post_id = test_posts[3].id
    res = authorized_client.post(f"/posts/{post_id}/comments", json={"content": "Comment by user2"})
    comment_id = res.json()["id"]

    res2 = authorized_client.delete(f"/comments/{comment_id}")
    assert res2.status_code == 204


def test_post_includes_comment_count(authorized_client, test_posts):
    post_id = test_posts[0].id
    authorized_client.post(f"/posts/{post_id}/comments", json={"content": "C1"})
    authorized_client.post(f"/posts/{post_id}/comments", json={"content": "C2"})

    res = authorized_client.get("/posts/")
    posts = res.json()
    target = [p for p in posts if p["Post"]["id"] == post_id]
    assert len(target) > 0
    assert target[0]["comment_count"] == 2
