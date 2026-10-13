# == DO NOT EDIT THE FOLLOWING LINES for the Raspberry Pi Pico VS Code Extension to work ==
if(WIN32)
    set(USERHOME $ENV{USERPROFILE})
else()
    set(USERHOME $ENV{HOME})
endif()
set(sdkVersion 2.2.0)
set(toolchainVersion 14_2_Rel1)
set(picotoolVersion 2.2.0-a4)
set(picoVscode ${USERHOME}/.pico-sdk/cmake/pico-vscode.cmake)
if (EXISTS ${picoVscode})
    include(${picoVscode})
endif()
# ====================================================================================
# cd build
# cmake -DPICO_BOARD=pico2_w -DCMAKE_BUILD_TYPE=Debug ..
# make -j

cmake_minimum_required(VERSION 3.27...3.31)

if (NOT DEFINED ENV{PICO_SDK_PATH} AND (NOT PICO_SDK_PATH))
    set(PICO_SDK_PATH ${CMAKE_CURRENT_LIST_DIR}/../pico-sdk)
endif ()

if (NOT DEFINED ENV{PICO_BOARD} AND (NOT PICO_BOARD))
    set(PICO_BOARD pico2_w)
endif ()

if (NOT DEFINED ENV{PICO_EXTRAS_PATH} AND (NOT PICO_EXTRAS_PATH))
  set(PICO_EXTRAS_PATH ${USERHOME}/Documents/pico-extras)	
endif ()

include(pico_sdk_import.cmake)
include(pico_extras_import.cmake)

pico_sdk_init()

project(picow-a2dp CXX C ASM)
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

add_executable(${PROJECT_NAME})

target_sources(${PROJECT_NAME} PRIVATE
    ${PICO_SDK_PATH}/lib/btstack/src/btstack_audio.c
    src/btstack_audio_pico_i2s.c
    src/main.c
    src/bt.c
    src/sdp.c
    src/a2dp.c
    src/avrcp.c
    src/gatt_service.c
)

target_compile_definitions(${PROJECT_NAME} PRIVATE
    PICO_AUDIO_I2S_DATA_PIN=9
    PICO_AUDIO_I2S_CLOCK_PIN_BASE=10  # =BCK, +1=LRCLK
    CYW43_LWIP=0
    # RUN_PIN=22
    #CONN_PIN=26
    BT_PIN="0000"
    BT_NAME="AED-Simulator-1"
)

target_link_libraries(${PROJECT_NAME}
    pico_stdlib
    # pico_stdio_usb  # use usb, not uart for stdio
    # pico_stdio_uart  # use uart, not usb for stdio e.g. via picoprobe
    pico_audio_i2s
    pico_btstack_ble
    pico_btstack_sbc_decoder
    pico_btstack_classic
    pico_btstack_cyw43
    pico_cyw43_arch_none
)

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_CURRENT_LIST_DIR} # For btstack config
)

# --- pico-kvstore (vendored under lib/pico-kvstore, BSD-3-Clause) ---
# The upstream CMakeLists are standalone projects (they call pico_sdk_init()),
# so define the library targets here directly, mirroring their definitions.
set(KVSTORE_DIR ${CMAKE_CURRENT_LIST_DIR}/lib/pico-kvstore)
set(PICO_VFS_DIR ${KVSTORE_DIR}/lib/pico-vfs)

add_library(blockdevice INTERFACE)
target_include_directories(blockdevice INTERFACE ${PICO_VFS_DIR}/include)

add_library(blockdevice_flash INTERFACE)
target_sources(blockdevice_flash INTERFACE ${PICO_VFS_DIR}/src/blockdevice/flash.c)
target_link_libraries(blockdevice_flash INTERFACE
    blockdevice
    hardware_exception
    hardware_flash
    pico_sync
    pico_flash
)

add_library(kvstore INTERFACE)
target_sources(kvstore INTERFACE ${KVSTORE_DIR}/src/kvstore.c)
target_include_directories(kvstore INTERFACE ${KVSTORE_DIR}/include)

add_library(kvstore_logkvs INTERFACE)
target_sources(kvstore_logkvs INTERFACE
    ${KVSTORE_DIR}/src/kvstore_logkvs.c
    ${KVSTORE_DIR}/src/blockdevice_stage.c
    ${KVSTORE_DIR}/src/crc32_ansi.c
)
target_include_directories(kvstore_logkvs INTERFACE ${KVSTORE_DIR}/include)
target_link_libraries(kvstore_logkvs INTERFACE
    kvstore
    blockdevice
)

add_library(kvstore_default INTERFACE)
target_sources(kvstore_default INTERFACE ${KVSTORE_DIR}/src/kvs_init.c)
target_include_directories(kvstore_default INTERFACE ${KVSTORE_DIR}/include)
target_link_libraries(kvstore_default INTERFACE
    kvstore
    kvstore_logkvs
    blockdevice_flash
    pico_btstack_flash_bank_headers
)

target_link_libraries(${PROJECT_NAME} kvstore_default)

pico_add_extra_outputs(${PROJECT_NAME})
# pico_enable_stdio_usb(${PROJECT_NAME} 1)
# pico_enable_stdio_uart(${PROJECT_NAME} 0)