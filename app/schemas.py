from pydantic import BaseModel, EmailStr, ConfigDict, conint

from datetime import datetime
from typing import Optional



# User
class UserCreate(BaseModel):
    email: EmailStr
    password: str

# User Response
class UserOut(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime

    # class Config:
    #     orm_mode = True     #This old syntax is deprecated
    model_config = ConfigDict(from_attributes=True) 


# class Post(BaseModel):
#     title: str
#     content: str
#     published: bool = True  #Default value
#     # rating: Optional[int] = None

# class CreatePost(BaseModel):
#     title: str
#     content: str
#     published: bool = True

# class UpdatePost(BaseModel):
#     title: str
#     content: str
#     published: bool

class PostBase(BaseModel):
    title: str
    content: str
    published: bool = True  #Default value

# Inheritance

class PostCreate(PostBase):     # By default automatically inherit all the fields of "PostBase" class
    pass    # Accepts same thing as "PostBase" class data

# class PostUpdate(PostBase):
#     pass



# Response Class

# class Post(BaseModel):
class Post(PostBase):
    id: int
    # title: str
    # content: str
    # published: bool
    created_at: datetime
    owner_id: int
    owner: UserOut

    # class Config:
    #     orm_mode = True     #This old syntax is deprecated
    model_config = ConfigDict(from_attributes=True)

class PostOut(BaseModel):
    Post: Post
    votes: int
    comment_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class CommentCreate(BaseModel):
    content: str
    parent_id: Optional[int] = None


class CommentOut(BaseModel):
    id: int
    post_id: int
    user_id: int
    content: str
    created_at: datetime
    parent_id: Optional[int] = None
    owner: UserOut
    replies: list["CommentOut"] = []

    model_config = ConfigDict(from_attributes=True)



# Authentication
class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    id: Optional[str] = None


# Comment
CommentOut.model_rebuild()


# Vote  
class Vote(BaseModel):
    post_id: int
    dir: conint(le=1)


# Notification
class NotificationOut(BaseModel):
    id: int
    user_id: int
    actor_id: int
    actor: UserOut
    post_id: Optional[int] = None
    comment_id: Optional[int] = None
    type: str
    read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationsList(BaseModel):
    notifications: list[NotificationOut]
    unread_count: int