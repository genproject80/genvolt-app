-- Seed: Initial Device Testing Table Configurations
-- Run AFTER add_device_testing_schema.sql

-- IoT_Raw_Messages
IF NOT EXISTS (SELECT 1 FROM DeviceTesting_TableConfig WHERE table_key = 'raw_messages')
BEGIN
    INSERT INTO DeviceTesting_TableConfig (table_key, table_name, display_name, icon_name, is_exportable, sort_order, column_config)
    VALUES (
        'raw_messages',
        'IoT_Raw_Messages',
        'Raw Messages',
        'DocumentTextIcon',
        1,
        1,
        '[
            {"field":"Entry_ID","header":"Entry ID","type":"number","sortable":true},
            {"field":"CreatedAt","header":"Created At (IST)","type":"datetime","sortable":true,"format":"utc_to_ist"},
            {"field":"Device_ID","header":"Device ID","type":"string","sortable":true,"searchable":true},
            {"field":"LogicId","header":"Logic ID","type":"number","sortable":true},
            {"field":"RawJson","header":"Raw JSON","type":"json","sortable":false}
        ]'
    );
    PRINT 'Seeded: raw_messages (IoT_Raw_Messages)';
END

-- IoT_Data_Sick (P1/P2)
IF NOT EXISTS (SELECT 1 FROM DeviceTesting_TableConfig WHERE table_key = 'sick_data')
BEGIN
    INSERT INTO DeviceTesting_TableConfig (table_key, table_name, display_name, icon_name, is_exportable, sort_order, column_config)
    VALUES (
        'sick_data',
        'IoT_Data_Sick',
        'SICK Data (P1/P2)',
        'CpuChipIcon',
        1,
        2,
        '[
            {"field":"Entry_ID","header":"Entry ID","type":"number","sortable":true},
            {"field":"CreatedAt","header":"Created At (IST)","type":"datetime","sortable":true,"format":"utc_to_ist"},
            {"field":"Device_ID","header":"Device ID","type":"string","sortable":true,"searchable":true},
            {"field":"MessageType","header":"Message Type","type":"string","sortable":true},
            {"field":"GSM_Signal_Strength","header":"GSM Signal","type":"number","sortable":true},
            {"field":"Motor_ON_Time_sec","header":"Motor ON (sec)","type":"number","sortable":true},
            {"field":"Latitude","header":"Latitude","type":"number","sortable":true},
            {"field":"Longitude","header":"Longitude","type":"number","sortable":true},
            {"field":"Fault_Code","header":"Fault Code","type":"string","sortable":true}
        ]'
    );
    PRINT 'Seeded: sick_data (IoT_Data_Sick)';
END

-- IoT_Data_Sick_P3
IF NOT EXISTS (SELECT 1 FROM DeviceTesting_TableConfig WHERE table_key = 'sick_data_p3')
BEGIN
    INSERT INTO DeviceTesting_TableConfig (table_key, table_name, display_name, icon_name, is_exportable, sort_order, column_config)
    VALUES (
        'sick_data_p3',
        'IoT_Data_Sick_P3',
        'SICK Data (P3)',
        'BoltIcon',
        1,
        3,
        '[
            {"field":"Entry_ID","header":"Entry ID","type":"number","sortable":true},
            {"field":"CreatedAt","header":"Created At (IST)","type":"datetime","sortable":true,"format":"utc_to_ist"},
            {"field":"Device_ID","header":"Device ID","type":"string","sortable":true,"searchable":true},
            {"field":"Event_Type","header":"Event Type","type":"string","sortable":true},
            {"field":"Event_Type_Description","header":"Description","type":"string","sortable":true},
            {"field":"Signal_Strength","header":"Signal","type":"number","sortable":true},
            {"field":"Battery_Voltage_mV","header":"Battery (mV)","type":"number","sortable":true}
        ]'
    );
    PRINT 'Seeded: sick_data_p3 (IoT_Data_Sick_P3)';
END

PRINT 'Seed complete.';