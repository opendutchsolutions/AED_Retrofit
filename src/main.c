#include "pico/stdlib.h"
#include "pico/cyw43_arch.h"
#include "hardware/watchdog.h"
#include "board_config.h"
#include "bt.h"
#include "gatt_service.h"
// Call this periodically, e.g. every 20 ms from a repeating timer
// void poll_buttons(void) {
//     static uint8_t last = 0xFF;
//     uint8_t current = sample_buttons(); // or replicate the logic inline
//     if (current != last) {
//         gatt_service_update_buttons(current);
//         last = current;
//     }
// }

// Unrecoverable error happened. Reboot by setting watchdog.
// Blink led until watchdog fires
// If RUN_PIN is defined then try reset via run pin after 5 blinks
void fatal() {
    watchdog_enable(1000, true);  // reboot in 1s
    #ifdef RUN_PIN
        unsigned count = 0;
    #endif
    while(true) {  // blink until reboot
        gpio_put(STATUS_LED_R_PIN, 0);
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, true);
        sleep_ms(20);
        gpio_put(STATUS_LED_R_PIN, 1);
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, false);
        sleep_ms(80);
        #ifdef RUN_PIN
            if (++count >= 5) {
                // Pull run pin low, to reset the pico
                gpio_init(RUN_PIN);
                gpio_set_dir(RUN_PIN, GPIO_OUT);
                gpio_put(RUN_PIN, (count & 1) ? false : true);
            }
        #endif
    }
}


void on_bt_up( void * ) {
    printf("Bluetooth stack is up\n");
    cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, false);
}

void led_pins_init() {
    gpio_init(STATUS_LED_B_PIN);
    gpio_init(STATUS_LED_G_PIN);
    gpio_init(STATUS_LED_R_PIN);

    gpio_set_dir(STATUS_LED_B_PIN, GPIO_OUT);
    gpio_set_dir(STATUS_LED_G_PIN, GPIO_OUT);   
    gpio_set_dir(STATUS_LED_R_PIN, GPIO_OUT);   
    gpio_put(STATUS_LED_R_PIN, 1);
    gpio_put(STATUS_LED_G_PIN, 1);
    gpio_put(STATUS_LED_B_PIN, 1);
    
    
}


int main() {
    stdio_init_all();



    // initialize CYW43 driver architecture (will enable BT if/because CYW43_ENABLE_BLUETOOTH == 1)
    if (cyw43_arch_init()) {
        printf("Failed to init cyw43_arch\n");
        fatal();
        return -1;
    }

    // led on during setup until bt is up
    cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, true);

    bt_begin(BT_NAME, BT_PIN, on_bt_up, NULL);
    led_pins_init();
    printf("Setup done\n");
    bt_run();

    fatal();
    return -2;
}
