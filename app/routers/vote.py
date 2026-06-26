from fastapi import Response, status, HTTPException, Depends, APIRouter
from sqlalchemy.orm import Session

from .. import schemas, database, models, oauth2


router = APIRouter(
    prefix="/vote",
    tags=['vote']
)


def _create_notification(db, user_id, actor_id, type, post_id=None, comment_id=None):
    if user_id == actor_id:
        return
    notification = models.Notification(
        user_id=user_id,
        actor_id=actor_id,
        type=type,
        post_id=post_id,
        comment_id=comment_id,
    )
    db.add(notification)


@router.get("/my")
def get_my_votes(db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    votes = db.query(models.Vote.post_id).filter(models.Vote.user_id == current_user.id).all()
    return [v.post_id for v in votes]

@router.post("/", status_code=status.HTTP_201_CREATED)
def vote(vote: schemas.Vote, db: Session = Depends(database.get_db), current_user: models.User = Depends(oauth2.get_current_user)):

    post = db.query(models.Post).filter(models.Post.id == vote.post_id).first()

    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Post with id: {vote.post_id} does not exist")
    
    vote_query = db.query(models.Vote).filter(models.Vote.post_id == vote.post_id, models.Vote.user_id == current_user.id)
    
    found_vote = vote_query.first()

    if(vote.dir == 1):
        if found_vote:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"user {current_user.id} has already voted on post {vote.post_id}")
        
        new_vote = models.Vote(post_id = vote.post_id, user_id=current_user.id)
        db.add(new_vote)
        _create_notification(db, post.owner_id, current_user.id, "like", post_id=post.id)
        db.commit()
        return {"message": "successfully added vote"} 
    
    else:
        if not found_vote:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote does not exist")
        
        vote_query.delete(synchronize_session=False)
        db.commit()

        return {"message": "successfully deleted vote"}