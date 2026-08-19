package com.mcm.passport.timeline;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TimelineEventRepository extends JpaRepository<TimelineEvent, Long> {
    List<TimelineEvent> findAllByPassportId(Long passportId);
}
