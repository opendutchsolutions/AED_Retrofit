#include "pico/stdlib.h"
#include "pico/cyw43_arch.h"
#include "hardware/watchdog.h"
#include "hardware/clocks.h"
#include "board_config.h"
#include "bt.h"
#include "gatt_service.h"

void fatal(void) {
    watchdog_enable(1000, true);  // Reboot in 1s

#ifdef RUN_PIN
    unsigned count = 0;
#endif

    // Blink until reboot
    while (true) {
        gpio_put(STATUS_LED_R_PIN, 0);
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, true);
        sleep_ms(20);
        gpio_put(STATUS_LED_R_PIN, 1);
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, false);
        sleep_ms(80);

#ifdef RUN_PIN
        if (++count >= 5) {
            // Pull run pin low to reset the pico
            gpio_init(RUN_PIN);
            gpio_set_dir(RUN_PIN, GPIO_OUT);
            gpio_put(RUN_PIN, (count & 1) ? false : true);
        }
#endif
    }
}

static void on_bt_up(void *context) {
    printf("Bluetooth stack is up\n");
}

static void led_pins_init(void) {
    gpio_init(STATUS_LED_B_PIN);
    gpio_init(STATUS_LED_G_PIN);
    gpio_init(STATUS_LED_R_PIN);
    gpio_set_dir(STATUS_LED_B_PIN, GPIO_OUT);
    gpio_set_dir(STATUS_LED_G_PIN, GPIO_OUT);
    gpio_set_dir(STATUS_LED_R_PIN, GPIO_OUT);
    gpio_set_drive_strength(STATUS_LED_B_PIN, GPIO_DRIVE_STRENGTH_2MA);
    gpio_set_drive_strength(STATUS_LED_G_PIN, GPIO_DRIVE_STRENGTH_2MA);
    gpio_set_drive_strength(STATUS_LED_R_PIN, GPIO_DRIVE_STRENGTH_2MA);
    gpio_set_slew_rate(STATUS_LED_B_PIN, GPIO_SLEW_RATE_SLOW);
    gpio_set_slew_rate(STATUS_LED_G_PIN, GPIO_SLEW_RATE_SLOW);
    gpio_set_slew_rate(STATUS_LED_R_PIN, GPIO_SLEW_RATE_SLOW);
    gpio_put(STATUS_LED_R_PIN, 1);
    gpio_put(STATUS_LED_G_PIN, 1);
    gpio_put(STATUS_LED_B_PIN, 1);
}

int main(void) {
    stdio_init_all();

    // Initialize CYW43 driver architecture
    // (will enable BT if/because CYW43_ENABLE_BLUETOOTH == 1)
    if (cyw43_arch_init()) {
        printf("Failed to init cyw43_arch\n");
        fatal();
        return -1;
    }
    cyw43_wifi_set_up(&cyw43_state, CYW43_ITF_STA, false, CYW43_COUNTRY_WORLDWIDE);
    bt_begin(BT_NAME, BT_PIN, on_bt_up, NULL);
    led_pins_init();

    printf("Setup done\n");

    bt_run();

    fatal();
    return -2;
}