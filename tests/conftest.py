## Pytest by-default allows all fixture present in "conftest.py" file to all the test files and methods

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app

from app.config import settings
from app.database import get_db, Base
from app.oauth2 import create_access_token
from app import models
from alembic import command



# SQLALCHEMY_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/fastapi_test'
SQLALCHEMY_DATABASE_URL = f'postgresql://{settings.database_username}:{settings.database_password}@{settings.database_hostname}/{settings.database_name}_test'

engine = create_engine(SQLALCHEMY_DATABASE_URL)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)



# Using SQL-ALCHEMY
# @pytest.fixture(scope = "session")
@pytest.fixture()
def session():
    # print("my session fixture ran")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

# @pytest.fixture(scope = "module")
@pytest.fixture()
def client(session):
    # Run the code before the test runs
    # Base.metadata.drop_all(bind=engine)         # Drop all tables (if exist)
    # Base.metadata.create_all(bind=engine)       # Create all the tables before the test runs
    def overridd_get_db():
        try:
            yield session
        finally:
            session.close()
    app.dependency_overrides[get_db] = overridd_get_db

    yield TestClient(app)

    #run the code after the test finishes
    # Base.metadata.drop_all(bind=engine)         # Delete all the tables after the test finishes



# Using Alembic

# @pytest.fixture
# def client():
#     command.upgrade("head")
#     yield TestClient(app)
#     command.downgrade("base")



# Test USERs:
@pytest.fixture
def test_user2(client):
    user_data = {"email": "alakh@gmail.com",
                 "password": "password1234"}
    res = client.post("/users/", json=user_data)

    assert res.status_code == 201

    # print(res.json())
    new_user = res.json()
    new_user['password'] = user_data['password']
    return new_user

@pytest.fixture
def test_user(client):
    user_data = {"email": "sanjeev@gmail.com",
                 "password": "password1234"}
    res = client.post("/users/", json=user_data)

    assert res.status_code == 201

    # print(res.json())
    new_user = res.json()
    new_user['password'] = user_data['password']
    return new_user



# Test POSTs
@pytest.fixture
def token(test_user):
    return create_access_token({"user_id": test_user['id']})

@pytest.fixture
def authorized_client(client, token):
    client.headers = {
        **client.headers,
        "Authorization": f"Bearer {token}"
    }

    return client

@pytest.fixture
def test_posts(test_user, session, test_user2):
    posts_data = [{
        "title": "first title",
        "content": "first content",
        "owner_id": test_user['id']
    }, {
        "title": "2nd title",
        "content": "2nd content",
        "owner_id": test_user['id']
    },
        {
        "title": "3rd title",
        "content": "3rd content",
        "owner_id": test_user['id'],
    },
        {
        "title": "4th title",
        "content": "4th content",
        "owner_id": test_user2['id']
    }]

    def create_post_model(post):
        return models.Post(**post)

    post_map = map(create_post_model, posts_data)
    posts = list(post_map)
    session.add_all(posts)

    # session.add_all([
    #     models.Post(title="1st title", content="1st content"),
    #     models.Post(title="2nd title", content="2nd content"),
    #     models.Post(title="3rd title", content="3rd content")])

    session.commit()
    posts = session.query(models.Post).all()
    return posts