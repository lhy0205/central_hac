package com.mcm.passport.passport;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SerialValidatorTest {

    @Test
    void acceptsNewFormat() {
        assertThat(SerialValidator.isValid("A1234")).isTrue();
        assertThat(SerialValidator.isValid("z9999")).isTrue();
    }

    @Test
    void acceptsVintageFormat() {
        assertThat(SerialValidator.isValid("1234")).isTrue();
        assertThat(SerialValidator.isValid("0007")).isTrue();
    }

    @Test
    void rejectsInvalidFormats() {
        assertThat(SerialValidator.isValid("AB123")).isFalse();
        assertThat(SerialValidator.isValid("12345")).isFalse();
        assertThat(SerialValidator.isValid("A123")).isFalse();
        assertThat(SerialValidator.isValid("")).isFalse();
        assertThat(SerialValidator.isValid(null)).isFalse();
    }
}
