import os
import unittest
from unittest.mock import patch

from app.auth import (
    ACCESS_TOKEN_ENV,
    DEPLOYMENT_BOUNDARY_ENV,
    PRIVATE_DEPLOYMENT_BOUNDARY,
    PUBLIC_DEPLOYMENT_BOUNDARY,
    validate_access_control_configuration,
)


class AccessControlConfigurationTests(unittest.TestCase):
    def test_development_allows_missing_token(self) -> None:
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "development",
                ACCESS_TOKEN_ENV: "",
            },
            clear=False,
        ):
            validate_access_control_configuration()

    def test_production_requires_token_for_public_boundary(self) -> None:
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                ACCESS_TOKEN_ENV: "",
                DEPLOYMENT_BOUNDARY_ENV: PUBLIC_DEPLOYMENT_BOUNDARY,
            },
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, ACCESS_TOKEN_ENV):
                validate_access_control_configuration()

    def test_production_allows_private_boundary_without_token(self) -> None:
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                ACCESS_TOKEN_ENV: "",
                DEPLOYMENT_BOUNDARY_ENV: PRIVATE_DEPLOYMENT_BOUNDARY,
            },
            clear=False,
        ):
            validate_access_control_configuration()

    def test_production_allows_public_boundary_with_token(self) -> None:
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                ACCESS_TOKEN_ENV: "long-random-token",
                DEPLOYMENT_BOUNDARY_ENV: PUBLIC_DEPLOYMENT_BOUNDARY,
            },
            clear=False,
        ):
            validate_access_control_configuration()

    def test_invalid_boundary_value_is_rejected(self) -> None:
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                ACCESS_TOKEN_ENV: "",
                DEPLOYMENT_BOUNDARY_ENV: "unknown",
            },
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, DEPLOYMENT_BOUNDARY_ENV):
                validate_access_control_configuration()


if __name__ == "__main__":
    unittest.main()
