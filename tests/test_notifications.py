import pytest
from app import models
from app.oauth2 import create_access_token
from fastapi.testclient import TestClient


@pytest.fixture
def test_user2_client(test_user2, session):
    """Return a separate client authenticated as test_user2."""
    from app.main import app
    from app.database import get_db

    def override_get_db():
        yield session
    app.dependency_overrides[get_db] = override_get_db

    token = create_access_token({"user_id": test_user2["id"]})
    tc = TestClient(app)
    tc.headers = {"Authorization": f"Bearer {token}"}
    return tc


@pytest.fixture
def test_like_notification(test_posts, test_user, test_user2, session):
    """test_user2 likes test_posts[0] (owned by test_user), creating notification."""
    like = models.Vote(post_id=test_posts[0].id, user_id=test_user2["id"])
    session.add(like)
    notif = models.Notification(
        user_id=test_user["id"],
        actor_id=test_user2["id"],
        type="like",
        post_id=test_posts[0].id,
    )
    session.add(notif)
    session.commit()
    session.refresh(notif)
    return notif


@pytest.fixture
def test_comment_notification(test_posts, test_user, test_user2, session):
    """test_user2 comments on test_posts[0], creating notification for test_user."""
    comment = models.Comment(post_id=test_posts[0].id, user_id=test_user2["id"], content="Nice!")
    session.add(comment)
    session.commit()
    session.refresh(comment)
    notif = models.Notification(
        user_id=test_user["id"],
        actor_id=test_user2["id"],
        type="comment",
        post_id=test_posts[0].id,
        comment_id=comment.id,
    )
    session.add(notif)
    session.commit()
    session.refresh(notif)
    return notif


def test_get_notifications_unauthenticated(client):
    res = client.get("/notifications/")
    assert res.status_code == 401


def test_get_notifications_empty(authorized_client):
    res = authorized_client.get("/notifications/")
    assert res.status_code == 200
    data = res.json()
    assert data["notifications"] == []
    assert data["unread_count"] == 0


def test_vote_triggers_notification(authorized_client, test_posts, session, test_user2):
    """Liking another user's post creates a notification for post owner."""
    post_id = test_posts[3].id
    user2_id = test_user2["id"]
    res = authorized_client.post("/vote/", json={"post_id": post_id, "dir": 1})
    assert res.status_code == 201

    notif = session.query(models.Notification).filter(
        models.Notification.user_id == user2_id
    ).first()
    assert notif is not None
    assert notif.type == "like"
    assert notif.post_id == post_id
    assert notif.read == False


def test_self_vote_no_notification(authorized_client, test_posts, session):
    """Liking own post should NOT create a notification."""
    res = authorized_client.post("/vote/", json={"post_id": test_posts[0].id, "dir": 1})
    assert res.status_code == 201

    notifs = session.query(models.Notification).all()
    assert len(notifs) == 0


def test_comment_triggers_notification(authorized_client, test_posts, session, test_user2):
    """Commenting on another user's post creates notification for post owner."""
    post_id = test_posts[3].id
    user2_id = test_user2["id"]
    res = authorized_client.post(
        f"/posts/{post_id}/comments", json={"content": "Great post!"}
    )
    assert res.status_code == 201

    notif = session.query(models.Notification).filter(
        models.Notification.user_id == user2_id
    ).first()
    assert notif is not None
    assert notif.type == "comment"
    assert notif.post_id == post_id
    assert notif.read == False


def test_self_comment_no_notification(authorized_client, test_posts, session):
    """Commenting on own post should NOT create a notification."""
    res = authorized_client.post(
        f"/posts/{test_posts[0].id}/comments", json={"content": "Self comment"}
    )
    assert res.status_code == 201

    notifs = session.query(models.Notification).all()
    assert len(notifs) == 0


def test_reply_triggers_notification(authorized_client, test_user2_client, test_posts, session):
    """Replying to someone else's comment creates 'reply' notification for parent comment owner."""
    post_id = test_posts[3].id
    # test_user (authorized_client) comments on test_posts[3] (owned by test_user2)
    res = authorized_client.post(
        f"/posts/{post_id}/comments", json={"content": "Parent comment"}
    )
    parent_id = res.json()["id"]

    # test_user2 replies to that comment
    res2 = test_user2_client.post(
        f"/posts/{post_id}/comments",
        json={"content": "Reply", "parent_id": parent_id},
    )
    assert res2.status_code == 201

    # Should create a "reply" notification for test_user (parent comment owner)
    notif = session.query(models.Notification).filter(
        models.Notification.type == "reply"
    ).first()
    assert notif is not None
    assert notif.type == "reply"
    assert notif.comment_id == res2.json()["id"]


def test_get_notifications_with_results(authorized_client, test_like_notification):
    """User with notifications gets them in response."""
    res = authorized_client.get("/notifications/")
    assert res.status_code == 200
    data = res.json()
    assert len(data["notifications"]) == 1
    assert data["unread_count"] == 1

    n = data["notifications"][0]
    assert n["type"] == "like"
    assert n["read"] == False
    assert n["post_id"] == test_like_notification.post_id
    assert "actor" in n
    assert n["actor"]["email"] is not None


def test_mark_read(authorized_client, test_like_notification):
    """Marking a notification as read should succeed."""
    res = authorized_client.put(f"/notifications/{test_like_notification.id}/read")
    assert res.status_code == 204

    # Verify unread_count decreases
    res2 = authorized_client.get("/notifications/")
    assert res2.json()["unread_count"] == 0


def test_mark_read_nonexistent(authorized_client):
    """Marking a non-existent notification returns 404."""
    res = authorized_client.put("/notifications/99999/read")
    assert res.status_code == 404


def test_mark_read_others_notification(authorized_client, test_user2_client, test_like_notification, session):
    """Another user cannot mark someone else's notification as read."""
    # test_like_notification is owned by test_user; try marking as test_user2
    res = test_user2_client.put(f"/notifications/{test_like_notification.id}/read")
    assert res.status_code == 403


def test_mark_all_read(authorized_client, test_like_notification, test_comment_notification, session):
    """Mark all notifications as read."""
    res = authorized_client.put("/notifications/read-all")
    assert res.status_code == 204

    res2 = authorized_client.get("/notifications/")
    data = res2.json()
    assert data["unread_count"] == 0
    for n in data["notifications"]:
        assert n["read"] == True


def test_notifications_ordered_by_newest(authorized_client, session, test_posts, test_user, test_user2):
    """Notifications should be returned newest first."""
    # Create two notifications at different times
    n1 = models.Notification(
        user_id=test_user["id"], actor_id=test_user2["id"],
        type="like", post_id=test_posts[0].id,
        created_at="2020-01-01T00:00:00+00:00"
    )
    n2 = models.Notification(
        user_id=test_user["id"], actor_id=test_user2["id"],
        type="comment", post_id=test_posts[0].id,
        created_at="2020-01-02T00:00:00+00:00"
    )
    session.add_all([n1, n2])
    session.commit()

    res = authorized_client.get("/notifications/")
    data = res.json()
    assert len(data["notifications"]) == 2
    types = [n["type"] for n in data["notifications"]]
    assert types == ["comment", "like"]


def test_unread_count_multiple(authorized_client, test_like_notification, test_comment_notification):
    """unread_count reflects total unread notifications."""
    res = authorized_client.get("/notifications/")
    assert res.json()["unread_count"] == 2

    # Mark one as read
    authorized_client.put(f"/notifications/{test_like_notification.id}/read")
    res2 = authorized_client.get("/notifications/")
    assert res2.json()["unread_count"] == 1


def test_user2_notifications_via_api(test_user2_client, authorized_client, test_posts):
    """test_user2 should see notifications when test_user interacts with test_user2's post."""
    post_id = test_posts[3].id
    # test_user likes test_user2's post
    authorized_client.post("/vote/", json={"post_id": post_id, "dir": 1})

    # test_user2 should have 1 unread notification
    res = test_user2_client.get("/notifications/")
    data = res.json()
    assert len(data["notifications"]) == 1
    assert data["unread_count"] == 1
    assert data["notifications"][0]["type"] == "like"


def test_delete_vote_does_not_delete_notification(authorized_client, test_posts, session, test_user2):
    """Unliking should not remove the notification that was already created."""
    post_id = test_posts[3].id
    user2_id = test_user2["id"]
    # Like first
    authorized_client.post("/vote/", json={"post_id": post_id, "dir": 1})
    before = session.query(models.Notification).filter(
        models.Notification.user_id == user2_id
    ).count()
    assert before == 1

    # Unlike
    authorized_client.post("/vote/", json={"post_id": post_id, "dir": 0})

    after = session.query(models.Notification).filter(
        models.Notification.user_id == user2_id
    ).count()
    assert after == 1
