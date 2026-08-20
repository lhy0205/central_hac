package com.mcm.passport.timeline;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "timeline_event")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TimelineEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false)
    private TimelineEventType eventType;

    @Column(length = 1000)
    private String note;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "event_date", nullable = false)
    private LocalDateTime eventDate;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public TimelineEvent(Long passportId, TimelineEventType eventType, String note, String imageUrl,
                          LocalDateTime eventDate) {
        this.passportId = passportId;
        this.eventType = eventType != null ? eventType : TimelineEventType.MOMENT;
        this.note = note;
        this.imageUrl = imageUrl;
        this.eventDate = eventDate;
    }

    public void updateNote(String note) {
        if (note != null) this.note = note;
    }

    @PrePersist
    void prePersist() {
        if (this.eventDate == null) {
            this.eventDate = this.createdAt;
        }
    }
}
