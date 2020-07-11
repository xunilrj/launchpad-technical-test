#! /bin/bash

npx snowpack build
ls build
rm ../.build/frontend -rf
mkdir ../.build/frontend -p
mv build ../.build/frontend