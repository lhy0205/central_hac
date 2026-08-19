package com.mcm.passport.passport;

import java.util.regex.Pattern;

public final class SerialValidator {

    private static final Pattern NEW_FORMAT = Pattern.compile("^[A-Za-z]\\d{4}$");
    private static final Pattern VINTAGE_FORMAT = Pattern.compile("^\\d{4}$");

    private SerialValidator() {
    }

    public static boolean isValid(String serialNumber) {
        if (serialNumber == null) {
            return false;
        }
        return NEW_FORMAT.matcher(serialNumber).matches()
            || VINTAGE_FORMAT.matcher(serialNumber).matches();
    }
}
