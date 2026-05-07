import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import UIEventBus from '../EventBus';

const experiences = [
    {
        id: 'galaxy',
        label: 'GALAXY EXPLORER',
        desc: 'Procedural spiral galaxy — click a star to warp',
        color: '#00c8ff',
    },
    {
        id: 'tunnel',
        label: 'WORMHOLE',
        desc: 'Shader tunnel — mouse-driven warp field',
        color: '#cc00ff',
    },
];

const ExperienceLauncher: React.FC = () => {
    const [hoveredId, setHoveredId]   = useState<string | null>(null);
    const [launching, setLaunching]   = useState(false);
    const [visible, setVisible]       = useState(true);

    useEffect(() => {
        UIEventBus.on('experienceLaunching', () => setVisible(false));
        UIEventBus.on('experienceExited',    () => {
            setVisible(true);
            setLaunching(false);
        });
    }, []);

    const handleClick = (id: string) => {
        if (launching) return;
        setLaunching(true);
        UIEventBus.dispatch('launchExperience', { id });
    };

    return (
        <motion.div
            animate={{ opacity: visible ? 1 : 0 }}
            transition={{ duration: 0.4 }}
            style={styles.root}
        >
            <div style={styles.header}>WALTER_OS  v1.0.0</div>
            <div style={styles.divider} />
            <div style={styles.subtitle}>SELECT AN EXPERIENCE</div>
            <div style={styles.tiles}>
                {experiences.map((exp) => (
                    <motion.div
                        key={exp.id}
                        style={{
                            ...styles.tile,
                            borderColor: exp.color,
                            background: hoveredId === exp.id
                                ? `${exp.color}22`
                                : 'transparent',
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onMouseEnter={() => setHoveredId(exp.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => handleClick(exp.id)}
                    >
                        <div style={{ ...styles.tileLabel, color: exp.color }}>
                            {exp.label}
                        </div>
                        <div style={styles.tileDesc}>{exp.desc}</div>
                        {launching && hoveredId === exp.id && (
                            <div style={{ ...styles.tileStatus, color: exp.color }}>
                                LAUNCHING...
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
            <div style={styles.footer}>CLICK A TILE TO ENTER</div>
        </motion.div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    root: {
        width: '1280px',
        height: '1024px',
        background: '#0d1117',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Courier New", Courier, monospace',
        color: '#cccccc',
        boxSizing: 'border-box',
        padding: '80px 120px',
        gap: '32px',
        userSelect: 'none',
    },
    header: {
        fontSize: '28px',
        letterSpacing: '8px',
        color: '#ffffff',
        textAlign: 'center',
    },
    divider: {
        width: '100%',
        height: '1px',
        background: '#333344',
    },
    subtitle: {
        fontSize: '13px',
        letterSpacing: '6px',
        color: '#555577',
    },
    tiles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
        width: '100%',
    },
    tile: {
        border: '2px solid',
        padding: '40px 48px',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
        position: 'relative',
    },
    tileLabel: {
        fontSize: '22px',
        letterSpacing: '5px',
        marginBottom: '10px',
    },
    tileDesc: {
        fontSize: '13px',
        color: '#667788',
        letterSpacing: '1px',
    },
    tileStatus: {
        position: 'absolute',
        top: '16px',
        right: '24px',
        fontSize: '12px',
        letterSpacing: '3px',
    },
    footer: {
        fontSize: '11px',
        letterSpacing: '4px',
        color: '#334455',
        textAlign: 'center',
    },
};

export { ExperienceLauncher };
export default ExperienceLauncher;
