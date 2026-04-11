#include "bt.h"
#include "sdp.h"
#include "a2dp.h"
#include "avrcp.h"
#include <hci.h>
#include "l2cap.h"
#include <btstack_event.h>
#include <btstack_run_loop.h>
#include <memory.h>
#include <stdio.h>
#include "gatt_service.h"

static bool _is_up = false;
static bd_addr_t _local_addr = {0};
static bt_on_up_cb_t _cb = 0;
static void *_data = 0;
static const char *_name = 0;
static const char *_pin = 0;
static btstack_packet_callback_registration_t _hci_registration;

// General Discoverable, BR/EDR supported (dual-mode — must NOT be 0x06)
#define APP_AD_FLAGS 0x02

// Advertising payload: flags + service UUID only (no name — name goes in scan response)
static uint8_t adv_data[] = {
    0x02, BLUETOOTH_DATA_TYPE_FLAGS, APP_AD_FLAGS,
    0x03, BLUETOOTH_DATA_TYPE_COMPLETE_LIST_OF_16_BIT_SERVICE_CLASS_UUIDS, 0x10, 0xFF,
};
static const uint8_t adv_data_len = sizeof(adv_data);

// Scan response: built at runtime from _name so BLE name matches Classic BT name
static uint8_t scan_resp_data[31];
static uint8_t scan_resp_data_len = 0;

static void packet_handler(uint8_t packet_type, uint16_t channel, uint8_t *packet, uint16_t size) {
    UNUSED(size);
    UNUSED(channel);

    bd_addr_t address;

    if (packet_type != HCI_EVENT_PACKET) return;

    switch (hci_event_packet_get_type(packet)) {
        case BTSTACK_EVENT_STATE:
            if (btstack_event_state_get_state(packet) != HCI_STATE_WORKING) return;

            gap_local_bd_addr(_local_addr);
            printf("[bt] stack up, addr %02x:%02x:%02x:%02x:%02x:%02x\n",
                   _local_addr[0], _local_addr[1], _local_addr[2],
                   _local_addr[3], _local_addr[4], _local_addr[5]);

            // Build scan response with actual device name
            {
                uint8_t name_len = (uint8_t)strlen(_name);
                if (name_len > 29) name_len = 29;
                scan_resp_data[0] = name_len + 1;
                scan_resp_data[1] = BLUETOOTH_DATA_TYPE_COMPLETE_LOCAL_NAME;
                memcpy(&scan_resp_data[2], _name, name_len);
                scan_resp_data_len = name_len + 2;
                gap_scan_response_set_data(scan_resp_data_len, scan_resp_data);
            }

            // BLE advertisements
            {
                uint16_t adv_int_min = 800;
                uint16_t adv_int_max = 800;
                uint8_t  adv_type    = 0;
                bd_addr_t null_addr;
                memset(null_addr, 0, 6);
                gap_advertisements_set_params(adv_int_min, adv_int_max, adv_type,
                                              0, null_addr, 0x07, 0x00);
                assert(adv_data_len <= 31);
                gap_advertisements_set_data(adv_data_len, (uint8_t *)adv_data);
                gap_advertisements_enable(1);
                gap_connectable_control(1);
            }

            gatt_service_start_timer();
            _is_up = true;
            if (_cb) (*_cb)(_data);
            break;

        case HCI_EVENT_CONNECTION_REQUEST:
            printf("[bt] Classic connection request\n");
            break;

        case HCI_EVENT_CONNECTION_COMPLETE:
            printf("[bt] Classic connection complete, status=0x%02x\n",
                   hci_event_connection_complete_get_status(packet));
            break;

        case HCI_EVENT_PIN_CODE_REQUEST:
            hci_event_pin_code_request_get_bd_addr(packet, address);
            gap_pin_code_response(address, _pin);
            break;

        default:
            break;
    }
}

void bt_begin(const char *name, const char *pin, bt_on_up_cb_t cb, void *data) {
    static bool _begun = false;
    if (_begun) return;
    _begun = true;

    _name = name ? name : "Pico 00:00:00:00:00:00";
    _pin  = pin  ? pin  : "0000";
    _data = data;
    _cb   = cb;

    l2cap_init();
    sdp_init();
    a2dp_sink_begin();
    avrcp_begin();
    sdp_begin();
    sm_init();
    sm_set_io_capabilities(IO_CAPABILITY_NO_INPUT_NO_OUTPUT);
    sm_set_authentication_requirements(0);
    gatt_service_init();

    gap_set_local_name(_name);      // Classic BT name
    gap_discoverable_control(1);
    gap_set_class_of_device(0x200414);
    gap_set_default_link_policy_settings(
        LM_LINK_POLICY_ENABLE_ROLE_SWITCH | LM_LINK_POLICY_ENABLE_SNIFF_MODE);
    gap_set_allow_role_switch(true);

    _hci_registration.callback = &packet_handler;
    hci_add_event_handler(&_hci_registration);
}

void bt_run(void) {
    hci_power_control(HCI_POWER_ON);
    btstack_run_loop_execute();
}

bool bt_up(void) {
    return _is_up;
}

void bt_addr(bd_addr_t local_addr) {
    memcpy(local_addr, _local_addr, sizeof(bd_addr_t));
}