from fastapi import Response, status, HTTPException, Depends, APIRouter
from sqlalchemy.orm import Session, joinedload
from typing import List

from .. import models, schemas, oauth2
from ..database import get_db


router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"]
)


@router.get("/", response_model=schemas.NotificationsList)
def get_notifications(db: Session = Depends(get_db),
                      current_user: models.User = Depends(oauth2.get_current_user)):
    notifications = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == current_user.id)
        .options(joinedload(models.Notification.actor))
        .order_by(models.Notification.created_at.desc())
        .limit(50)
        .all()
    )
    unread_count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.read == False
    ).count()
    return schemas.NotificationsList(notifications=notifications, unread_count=unread_count)


@router.put("/{id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(id: int, db: Session = Depends(get_db),
              current_user: models.User = Depends(oauth2.get_current_user)):
    notification = db.query(models.Notification).filter(models.Notification.id == id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    notification.read = True
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(db: Session = Depends(get_db),
                  current_user: models.User = Depends(oauth2.get_current_user)):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.read == False
    ).update({"read": True}, synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)