import { defineConfig } from '@playwright/test'
export default defineConfig({testDir:'./tests/browser',workers:1,use:{baseURL:'http://127.0.0.1:5180',channel:'msedge',headless:true},webServer:{command:'npm run dev -- --port 5180',url:'http://127.0.0.1:5180',reuseExistingServer:false},reporter:'list'})
