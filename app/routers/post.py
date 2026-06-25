from fastapi import FastAPI, Response, status , HTTPException, Depends, APIRouter
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import models, schemas, oauth2
from ..database import get_db


router = APIRouter(
    prefix="/posts",     # Prefix added before every route
    tags=['Posts']
)

# GET Operation

# @router.get("/", response_model=List[schemas.Post])
@router.get("/", response_model=List[schemas.PostOut])
def get_posts(db: Session = Depends(get_db), current_user: int = Depends(oauth2.get_current_user), limit: int = 10, skip: int = 0, search: Optional[str] = ""):
# Using regular Raw SQL
    # cursor.execute(""" SELECT * FROM posts""")
    # posts = cursor.fetchall()
    # return {"data": posts}

# Using ORM

# To get post only of the logged in user
    # posts = db.query(models.Post).filter(models.Post.owner_id == current_user.id).all()
    # print(limit)
    # posts = db.query(models.Post).filter(models.Post.title.contains(search)).limit(limit).offset(skip).all()
    
    posts = (db.query(models.Post, func.count(models.Vote.post_id).label("votes"))
    .join(models.Vote, models.Vote.post_id == models.Post.id, isouter=True)
    .group_by(models.Post.id)
    .filter(models.Post.title.contains(search))
    .limit(limit)
    .offset(skip)
    .all())

    # print(posts)   

    # print(current_user.id)
    # print(posts)      # To view the SQL Query
    return posts

@router.get("/latest")
def get_latest_post(db: Session = Depends(get_db)):
    # post = my_posts[len(my_posts)-1]
    post = db.query(models.Post).order_by(models.Post.id.desc()).first()
    return post

# @router.get("/{id}", response_model=schemas.Post)
@router.get("/{id}", response_model=schemas.PostOut)
def get_post(id: int, db: Session = Depends(get_db), current_user: int = Depends(oauth2.get_current_user)):
    # print(type(id))     #"id" is of type integer
    # post = find_post(id)
    
    # cursor.execute("""SELECT * FROM posts WHERE id = %s""", (str(id)))
    # post = cursor.fetchone()

    # post = db.query(models.Post).filter(models.Post.id == id).first()
    # print(post)

    post = db.query(models.Post, func.count(models.Vote.post_id).label("votes")).join(models.Vote, models.Vote.post_id == models.Post.id, isouter=True).group_by(models.Post.id).filter(models.Post.id == id).first()

    # print(post)
    
    if not post:
        raise HTTPException(status_code = status.HTTP_404_NOT_FOUND,
                            detail = f"post with id: {id} was not")
    #     response.status_code = status.HTTP_404_NOT_FOUND
    #     return {'message': f"post with id: {id} was  not found"}

# To get post only of the logged in user
    # if post.owner_id != current_user.id:
    #     raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised to perform the requested action")
    
    return post



#POST Operation (create)

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.Post)
def create_posts(post: schemas.PostCreate, db: Session = Depends(get_db), current_user: int = Depends(oauth2.get_current_user)):
    # print(post.rating)
    # print(post.dict())     #To convert to a dictionary
    # post_dict = post.dict()
    # post_dict['id'] = randrange(0, 10000000)
    # my_posts.append(post_dict)

# Using Raw SQL query
# This way of writing INSERT SQL QUERY is vulnerable to SQL injection
    # cursor.execute(f"INSERT INTO posts (title, content, published) VALUES ({post.title}, {post.content}, {post.published})")

# This is the safest way to write INSERT STATEMENT -> But order of writing the value matters (in both the case)
    # cursor.execute(""" INSERT INTO posts (title, content, published) 
    # VALUES (%s, %s, %s) RETURNING * """, 
    #                     (post.title, post.content, post.published))
    
    # new_post = cursor.fetchone()

    # #Perform Commit operation to save in the database
    # conn.commit()

    # return{"data": new_post}

#Using ORM
    # new_post = models.Post(
    #     title=post.title, content=post.content, published=post.published)
    
    # print(current_user.id)
    # print(current_user)
    new_post = models.Post(owner_id=current_user.id, **post.dict())      # Unpack the dictionary
    
    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    return new_post
# Data expected from user for creating a post: title str, content str



# DELETE Operation

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(id: int, db: Session = Depends(get_db), current_user: int = Depends(oauth2.get_current_user)):
    # Deleting post
    # Find the index in the array that has required ID
    # my_posts.pop(index)
    # index = find_index_post(id)

    # cursor.execute("""DELETE FROM posts WHERE id = %s RETURNING * """, (str(id)))
    # deleted_post = cursor.fetchone()
    # conn.commit()

    post_query = db.query(models.Post).filter(models.Post.id == id)

    post = post_query.first()

    # if index == None:
    # if deleted_post == None:
    if post == None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail = f"Post with id: {id} doesn't exist")
    
    if post.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised to perform the requested action")
    
    post_query.delete(synchronize_session=False)
    db.commit()

    # my_posts.pop(index)
    return Response(status_code=status.HTTP_204_NO_CONTENT)     #Extra thing to be noticed in case of delete



# UPDATE Operation

@router.put("/{id}", response_model=schemas.Post)
def update_post(id: int, updated_post: schemas.PostCreate, db: Session = Depends(get_db), current_user: int = Depends(oauth2.get_current_user)):
    # print(post)
    # print(post.dict())
    # index = find_index_post(id)

# Using Raw SQL query
    # cursor.execute("""UPDATE posts SET title = %s, content = %s, published = %s WHERE id = %s RETURNING * """, (post.title, post.content, post.published, str(id)))
    
    # updated_post = cursor.fetchone()
    # conn.commit()

    post_query = db.query(models.Post).filter(models.Post.id == id)

    post = post_query.first()

    # if index == None:
    # if updated_post == None:
    if post == None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Post with id: {id} doesn't exist")
    
    if post.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised to perform the requested action")
    
    # post_query.update({'title': 'Hey this is my updated title','content': 'This is my updated content'},synchronize_session=False)
    
    post_query.update(updated_post.dict(), synchronize_session=False)

    db.commit()

    # post_dict = post.dict()
    # post_dict['id'] = id
    # my_posts[index] = post_dict

    return post_query.first()