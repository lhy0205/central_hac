package com.mcm.passport.notification;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    Page<Notification> findAllByPassportIdOrderByCreatedAtDesc(Long passportId, Pageable pageable);
    List<Notification> findAllByPassportIdAndReadTrue(Long passportId);
    boolean existsByPassportIdAndTypeAndCreatedAtAfter(Long passportId, NotificationType type, LocalDateTime after);

    @Query("select n.passportId from Notification n where n.type = :type and n.createdAt > :after")
    List<Long> findPassportIdsByTypeAndCreatedAtAfter(NotificationType type, LocalDateTime after);

    List<Notification> findAllByPassportIdInAndType(List<Long> passportIds, NotificationType type);
}
