from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models
from .database import engine
from .routers import post, user, auth, vote

from .config import settings


print(settings.database_username)


# It tells SQL-Alchemy to run the create statements to generate all the tables when it fast started up
# models.Base.metadata.create_all(bind=engine)

# Now, the above line of code is note required, since, we already have alembic

app = FastAPI()

# CORS - Cross Origin Resource Sharing

origins = ["*"]     #List of domains that are allowed to access ("*" means all)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# my_posts = [{"title": "title of post 1", "content": "ontent of post 1", "id": 1}, {"title": "favourite foods", "content": "I like pizza", "id": 2}]

# def find_post(id):
#     for p in my_posts:
#         if p["id"] == id:
#             return p

# def find_index_post(id):
#     for i, p in enumerate(my_posts):
#         if p['id'] == id:
#             return i



# Imports all the respective routes
app.include_router(post.router)
app.include_router(user.router)
app.include_router(auth.router)
app.include_router(vote.router)

@app.get("/")
def root():    #The function name doesn't matter
    return {"message": "Welcome to my API. Successfully deployed CI/CD pipeline."}