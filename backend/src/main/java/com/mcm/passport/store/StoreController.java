package com.mcm.passport.store;

import com.mcm.passport.store.dto.StoreResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class StoreController {

    private final StoreService storeService;

    @GetMapping("/api/stores")
    public ResponseEntity<Page<StoreResponse>> list(@PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(storeService.list(pageable));
    }

    @GetMapping("/api/stores/{id}")
    public ResponseEntity<StoreResponse> getDetail(@PathVariable Long id) {
        return ResponseEntity.ok(storeService.getDetail(id));
    }
}
