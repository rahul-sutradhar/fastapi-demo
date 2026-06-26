from fastapi import Response, status, HTTPException, Depends, APIRouter
from sqlalchemy.orm import Session, joinedload
from typing import List

from .. import models, schemas, oauth2
from ..database import get_db

router = APIRouter(tags=["Comments"])


def _notify_comment(db, comment, current_user):
    post = db.query(models.Post).filter(models.Post.id == comment.post_id).first()
    if not post:
        return
    if comment.parent_id:
        parent = db.query(models.Comment).filter(models.Comment.id == comment.parent_id).first()
        if parent and parent.user_id != current_user.id:
            notification = models.Notification(
                user_id=parent.user_id,
                actor_id=current_user.id,
                type="reply",
                post_id=comment.post_id,
                comment_id=comment.id,
            )
            db.add(notification)
    elif post.owner_id != current_user.id:
        notification = models.Notification(
            user_id=post.owner_id,
            actor_id=current_user.id,
            type="comment",
            post_id=comment.post_id,
            comment_id=comment.id,
        )
        db.add(notification)


@router.get("/posts/{post_id}/comments", response_model=List[schemas.CommentOut])
def get_comments(post_id: int, db: Session = Depends(get_db),
                 current_user: int = Depends(oauth2.get_current_user)):
    comments = (
        db.query(models.Comment)
        .filter(models.Comment.post_id == post_id, models.Comment.parent_id == None)
        .options(joinedload(models.Comment.owner), joinedload(models.Comment.replies).joinedload(models.Comment.owner))
        .order_by(models.Comment.created_at.desc())
        .all()
    )
    return comments


@router.post("/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED, response_model=schemas.CommentOut)
def create_comment(post_id: str, comment: schemas.CommentCreate, db: Session = Depends(get_db),
                   current_user: int = Depends(oauth2.get_current_user)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if comment.parent_id:
        parent = db.query(models.Comment).filter(models.Comment.id == comment.parent_id).first()
        if not parent or parent.post_id != int(post_id):
            raise HTTPException(status_code=404, detail="Parent comment not found")

    db_comment = models.Comment(
        post_id=int(post_id),
        user_id=current_user.id,
        content=comment.content,
        parent_id=comment.parent_id
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    db_comment = db.query(models.Comment).options(
        joinedload(models.Comment.owner)
    ).filter(models.Comment.id == db_comment.id).first()
    _notify_comment(db, db_comment, current_user)
    db.commit()
    return db_comment


@router.delete("/comments/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(id: int, db: Session = Depends(get_db),
                   current_user: int = Depends(oauth2.get_current_user)):
    comment = db.query(models.Comment).filter(models.Comment.id == id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(comment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
