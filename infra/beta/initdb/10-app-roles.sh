#!/bin/sh
# Runs once, when the database volume is first created (the postgres image's
# docker-entrypoint-initdb.d). The same roles as scripts/bootstrap_db.py (D036):
# app_owner owns the database and runs migrations; app_runtime gets DML grants
# from the migrations and nothing else. Neither can create roles or databases.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$OWNER_PASSWORD" -v runtime_pw="$RUNTIME_PASSWORD" <<'SQL'
CREATE ROLE app_owner WITH LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB PASSWORD :'owner_pw';
CREATE ROLE app_runtime WITH LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB PASSWORD :'runtime_pw';
CREATE DATABASE datingapp OWNER app_owner ENCODING 'UTF8' TEMPLATE template0;
SQL
