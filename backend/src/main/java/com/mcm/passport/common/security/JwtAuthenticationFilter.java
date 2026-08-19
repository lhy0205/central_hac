package com.mcm.passport.common.security;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final AccountRepository accountRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            // 서명/만료가 유효해도 그 사이 계정이 탈퇴했을 수 있다 — 각 서비스에서도 재확인하지만
            // 여기서 한 번 더 막아둔다.
            if (jwtTokenProvider.isValid(token)) {
                Long accountId = jwtTokenProvider.getAccountId(token);
                boolean isActiveAccount = accountRepository.findById(accountId)
                    .map(Account::isActive)
                    .orElse(false);
                if (isActiveAccount) {
                    var authentication = new UsernamePasswordAuthenticationToken(
                        String.valueOf(accountId), null, List.of());
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                }
            }
        }
        chain.doFilter(request, response);
    }
}
