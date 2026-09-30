import unittest

from backend.app import main


class CorsConfigTests(unittest.TestCase):
    def test_capacitor_android_origin_is_allowed_without_wildcards(self):
        middleware = next(item for item in main.app.user_middleware if item.cls.__name__ == "CORSMiddleware")
        origins = middleware.kwargs["allow_origins"]

        self.assertIn("https://localhost", origins)
        self.assertNotIn("*", origins)


if __name__ == "__main__":
    unittest.main()
