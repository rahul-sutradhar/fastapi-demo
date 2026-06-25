from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import post, user, auth, vote, cloudinary_upload

from .config import settings


print(settings.database_username)


app = FastAPI()


origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(post.router)
app.include_router(user.router)
app.include_router(auth.router)
app.include_router(vote.router)
app.include_router(cloudinary_upload.router)


@app.get("/")
def root():
    return {"message": "Welcome to my API. Successfully deployed CI/CD pipeline."}