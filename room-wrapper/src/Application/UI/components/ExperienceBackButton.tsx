import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import UIEventBus from '../EventBus';

const ExperienceBackButton: React.FC = () => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        UIEventBus.on('experienceLaunched', () => setVisible(true));
        UIEventBus.on('experienceExited',   () => setVisible(false));
    }, []);

    const handleClick = () => {
        UIEventBus.dispatch('exitExperience', {});
    };

    return (
        <motion.div
            initial="hide"
            animate={visible ? 'visible' : 'hide'}
            variants={vars}
            style={styles.wrapper}
            id="prevent-click"
        >
            <button style={styles.button} onClick={handleClick}>
                ← EXIT
            </button>
        </motion.div>
    );
};

const vars = {
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, delay: 0.2, ease: 'easeOut' },
    },
    hide: {
        opacity: 0,
        y: 16,
        transition: { duration: 0.3, ease: 'easeOut' },
    },
};

const styles: { [key: string]: React.CSSProperties } = {
    wrapper: {
        position: 'absolute',
        bottom: '48px',
        right: '48px',
        zIndex: 100,
        pointerEvents: 'auto',
    },
    button: {
        background: '#000000',
        color: '#ffffff',
        border: '2px solid #ffffff',
        padding: '14px 32px',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '13px',
        letterSpacing: '4px',
        cursor: 'pointer',
        transition: 'background 0.2s ease, color 0.2s ease',
    },
};

export default ExperienceBackButton;
