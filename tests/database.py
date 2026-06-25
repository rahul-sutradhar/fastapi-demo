## This file is not in use -> Everything of this file is transferred to "conftest.py" file

from fastapi.testclient import TestClient
import pytest
from app.main import app

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.database import get_db, Base
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
