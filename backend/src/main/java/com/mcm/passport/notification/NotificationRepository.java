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

    // NotificationService.generateReminders()에서만 사용: 매일 전체 ACTIVE 여권을 순회하며 여권마다
    // existsByPassportIdAndTypeAndCreatedAtAfter를 한 번씩 호출하면(N+1) 여권 수만큼 쿼리가 늘어난다.
    // 쿨다운 기준 시각과 알림 종류는 순회 전체에서 동일하므로, 이미 최근에 리마인드된 여권 id 집합을
    // 한 번의 쿼리로 가져와 in-memory contains()로 대체한다.
    @Query("select n.passportId from Notification n where n.type = :type and n.createdAt > :after")
    List<Long> findPassportIdsByTypeAndCreatedAtAfter(NotificationType type, LocalDateTime after);

    // NotificationService.generateReminders()에서만 사용: 마일스톤(100/365/1000일) 알림은 스케줄러가
    // 그 날 정확히 실행되지 않으면(배포/장애로 하루 건너뜀) 영영 못 보내던 문제가 있었다. "이 여권에
    // 이미 몇 개의 마일스톤 알림을 보냈는가"를 배치로 가져와, 지나친 마일스톤 중 아직 안 보낸 것만
    // 따라잡아 보내는 방식으로 바꿨다.
    List<Notification> findAllByPassportIdInAndType(List<Long> passportIds, NotificationType type);
}
