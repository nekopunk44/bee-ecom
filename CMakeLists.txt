cmake_minimum_required(VERSION 3.25)
project(bee VERSION 0.1.0 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
include(CTest)
find_package(Drogon 1.9.11 CONFIG REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(SODIUM REQUIRED IMPORTED_TARGET libsodium)
pkg_check_modules(VIPS REQUIRED IMPORTED_TARGET vips)
find_package(CURL REQUIRED)
add_library(bee_platform
  services/api/src/platform/Config.cpp
  services/api/src/platform/Logging.cpp
)
target_include_directories(bee_platform PUBLIC services/api/src)
target_link_libraries(bee_platform PUBLIC Drogon::Drogon)
target_compile_options(bee_platform PRIVATE -Wall -Wextra -Wpedantic)
add_library(bee_application
  services/api/src/platform/Http.cpp
  services/api/src/modules/auth/Auth.cpp
  services/api/src/modules/auth/AuthRepository.cpp
  services/api/src/modules/catalog/CatalogController.cpp
  services/api/src/modules/catalog/CatalogService.cpp
  services/api/src/modules/catalog/CatalogRepository.cpp
  services/api/src/modules/media/Media.cpp
  services/api/src/modules/media/S3Storage.cpp
)
target_link_libraries(bee_application PUBLIC bee_platform PkgConfig::SODIUM PkgConfig::VIPS CURL::libcurl)
target_compile_options(bee_application PRIVATE -Wall -Wextra -Wpedantic)
add_executable(bee-api
  services/api/src/main.cpp
  services/api/src/modules/health/HealthController.cpp
  services/api/src/modules/health/HealthService.cpp
  services/api/src/modules/health/HealthRepository.cpp
)
target_link_libraries(bee-api PRIVATE bee_application)
add_executable(bee-admin-create services/api/src/admin_create.cpp)
target_link_libraries(bee-admin-create PRIVATE bee_application)
target_compile_options(bee-api PRIVATE -Wall -Wextra -Wpedantic)
add_executable(bee-worker
  services/worker/src/main.cpp
  services/worker/src/OutboxRepository.cpp
)
target_link_libraries(bee-worker PRIVATE bee_platform)
target_compile_options(bee-worker PRIVATE -Wall -Wextra -Wpedantic)
if(BUILD_TESTING)
  add_executable(catalog-tests services/api/tests/catalog_test.cpp)
  target_link_libraries(catalog-tests PRIVATE bee_application)
  add_test(NAME catalog-validation COMMAND catalog-tests)
  add_executable(config-tests services/api/tests/config_test.cpp)
  target_link_libraries(config-tests PRIVATE bee_platform)
  add_test(NAME configuration COMMAND config-tests)
endif()
install(TARGETS bee-api bee-worker RUNTIME DESTINATION bin)
