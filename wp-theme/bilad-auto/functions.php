<?php
/**
 * Bilad Auto — Theme Functions
 *
 * @package BiladAuto
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'BILAD_VERSION', '1.0.0' );
define( 'BILAD_DIR', get_template_directory() );
define( 'BILAD_URI', get_template_directory_uri() );

/**
 * إعداد الثيم
 */
function bilad_setup() {
	load_theme_textdomain( 'bilad-auto', BILAD_DIR . '/languages' );

	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'customize-selective-refresh-widgets' );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'align-wide' );

	add_theme_support(
		'html5',
		array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' )
	);

	add_theme_support(
		'custom-logo',
		array(
			'height'      => 60,
			'width'       => 220,
			'flex-height' => true,
			'flex-width'  => true,
		)
	);

	register_nav_menus(
		array(
			'primary' => __( 'القائمة الرئيسية', 'bilad-auto' ),
			'footer'  => __( 'قائمة التذييل', 'bilad-auto' ),
		)
	);

	// أحجام صور مخصصة
	add_image_size( 'bilad-project', 800, 500, true );
	add_image_size( 'bilad-hero', 2560, 1440, true );
}
add_action( 'after_setup_theme', 'bilad_setup' );

/**
 * تحميل ملفات CSS و JS
 */
function bilad_scripts() {
	// خط Cairo العربي
	wp_enqueue_style(
		'bilad-fonts',
		'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap',
		array(),
		null
	);

	wp_enqueue_style( 'bilad-main', BILAD_URI . '/assets/css/main.css', array(), BILAD_VERSION );

	// أنماط الهيرو — الصفحة الرئيسية فقط
	if ( is_front_page() ) {
		wp_enqueue_style( 'bilad-hero', BILAD_URI . '/assets/css/hero.css', array( 'bilad-main' ), BILAD_VERSION );
	}

	// ملف style.css الرئيسي للثيم (مطلوب من ووردبريس)
	wp_enqueue_style( 'bilad-style', get_stylesheet_uri(), array( 'bilad-main' ), BILAD_VERSION );

	wp_enqueue_script( 'bilad-main-js', BILAD_URI . '/assets/js/main.js', array(), BILAD_VERSION, true );

	if ( is_front_page() ) {
		wp_enqueue_script( 'bilad-hero-js', BILAD_URI . '/assets/js/hero.js', array(), BILAD_VERSION, true );
	}

	// تمرير بيانات للجافاسكربت
	wp_localize_script(
		'bilad-main-js',
		'biladData',
		array(
			'ajaxUrl'  => admin_url( 'admin-ajax.php' ),
			'nonce'    => wp_create_nonce( 'bilad_nonce' ),
			'homeUrl'  => home_url( '/' ),
			'themeUri' => BILAD_URI,
		)
	);

	if ( is_singular() && comments_open() && get_option( 'thread_comments' ) ) {
		wp_enqueue_script( 'comment-reply' );
	}
}
add_action( 'wp_enqueue_scripts', 'bilad_scripts' );

/**
 * مناطق الودجت
 */
function bilad_widgets_init() {
	register_sidebar(
		array(
			'name'          => __( 'الشريط الجانبي', 'bilad-auto' ),
			'id'            => 'sidebar-1',
			'description'   => __( 'ودجتات تظهر في الشريط الجانبي', 'bilad-auto' ),
			'before_widget' => '<section id="%1$s" class="widget %2$s">',
			'after_widget'  => '</section>',
			'before_title'  => '<h3 class="widget-title">',
			'after_title'   => '</h3>',
		)
	);
}
add_action( 'widgets_init', 'bilad_widgets_init' );

/**
 * تسجيل نوع المحتوى: المشاريع
 */
function bilad_register_projects_cpt() {
	$labels = array(
		'name'               => __( 'المشاريع', 'bilad-auto' ),
		'singular_name'      => __( 'مشروع', 'bilad-auto' ),
		'add_new'            => __( 'إضافة مشروع', 'bilad-auto' ),
		'add_new_item'       => __( 'إضافة مشروع جديد', 'bilad-auto' ),
		'edit_item'          => __( 'تعديل المشروع', 'bilad-auto' ),
		'new_item'           => __( 'مشروع جديد', 'bilad-auto' ),
		'view_item'          => __( 'عرض المشروع', 'bilad-auto' ),
		'search_items'       => __( 'بحث في المشاريع', 'bilad-auto' ),
		'not_found'          => __( 'لا توجد مشاريع', 'bilad-auto' ),
		'not_found_in_trash' => __( 'لا توجد مشاريع في المهملات', 'bilad-auto' ),
		'menu_name'          => __( 'المشاريع', 'bilad-auto' ),
	);

	register_post_type(
		'project',
		array(
			'labels'       => $labels,
			'public'       => true,
			'has_archive'  => true,
			'menu_icon'    => 'dashicons-building',
			'menu_position'=> 5,
			'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt', 'custom-fields' ),
			'rewrite'      => array( 'slug' => 'projects' ),
			'show_in_rest' => true,
		)
	);

	// تصنيف: نوع المشروع
	register_taxonomy(
		'project_type',
		'project',
		array(
			'labels'       => array(
				'name'          => __( 'أنواع المشاريع', 'bilad-auto' ),
				'singular_name' => __( 'نوع المشروع', 'bilad-auto' ),
			),
			'hierarchical' => true,
			'public'       => true,
			'show_in_rest' => true,
			'rewrite'      => array( 'slug' => 'project-type' ),
		)
	);
}
add_action( 'init', 'bilad_register_projects_cpt' );

/**
 * تسجيل نوع المحتوى: الخدمات
 */
function bilad_register_services_cpt() {
	$labels = array(
		'name'          => __( 'الخدمات', 'bilad-auto' ),
		'singular_name' => __( 'خدمة', 'bilad-auto' ),
		'add_new'       => __( 'إضافة خدمة', 'bilad-auto' ),
		'add_new_item'  => __( 'إضافة خدمة جديدة', 'bilad-auto' ),
		'edit_item'     => __( 'تعديل الخدمة', 'bilad-auto' ),
		'menu_name'     => __( 'الخدمات', 'bilad-auto' ),
	);

	register_post_type(
		'service',
		array(
			'labels'       => $labels,
			'public'       => true,
			'has_archive'  => true,
			'menu_icon'    => 'dashicons-lightbulb',
			'menu_position'=> 6,
			'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt', 'custom-fields' ),
			'rewrite'      => array( 'slug' => 'services' ),
			'show_in_rest' => true,
		)
	);
}
add_action( 'init', 'bilad_register_services_cpt' );

/**
 * خيارات المخصص (Customizer)
 */
function bilad_customize_register( $wp_customize ) {

	/* ── قسم: معلومات التواصل ─────────────────────── */
	$wp_customize->add_section(
		'bilad_contact',
		array(
			'title'    => __( 'معلومات التواصل — بلاد أوتو', 'bilad-auto' ),
			'priority' => 30,
		)
	);

	$contact_fields = array(
		'bilad_whatsapp'  => array(
			'label'   => __( 'رقم الواتساب (بصيغة دولية بدون +)', 'bilad-auto' ),
			'default' => '9647712345678',
		),
		'bilad_phone'     => array(
			'label'   => __( 'رقم الهاتف للعرض', 'bilad-auto' ),
			'default' => '+964 771 234 5678',
		),
		'bilad_email'     => array(
			'label'   => __( 'البريد الإلكتروني', 'bilad-auto' ),
			'default' => 'info@biladauto.iq',
		),
		'bilad_address'   => array(
			'label'   => __( 'العنوان', 'bilad-auto' ),
			'default' => 'بغداد، العراق',
		),
		'bilad_hours'     => array(
			'label'   => __( 'ساعات العمل', 'bilad-auto' ),
			'default' => 'السبت – الخميس، 9 صباحاً – 6 مساءً',
		),
		'bilad_map_embed' => array(
			'label'   => __( 'رابط خريطة جوجل (Embed URL)', 'bilad-auto' ),
			'default' => '',
		),
	);

	foreach ( $contact_fields as $id => $field ) {
		$wp_customize->add_setting(
			$id,
			array(
				'default'           => $field['default'],
				'sanitize_callback' => 'sanitize_text_field',
				'transport'         => 'refresh',
			)
		);
		$wp_customize->add_control(
			$id,
			array(
				'label'   => $field['label'],
				'section' => 'bilad_contact',
				'type'    => 'text',
			)
		);
	}

	/* ── قسم: الهيرو التفاعلي ─────────────────────── */
	$wp_customize->add_section(
		'bilad_hero',
		array(
			'title'       => __( 'الهيرو التفاعلي (الإكس راي)', 'bilad-auto' ),
			'priority'    => 31,
			'description' => __( 'ارفع صورتين بنفس الأبعاد بالضبط: صورة السقوف (الطبقة الأساسية) وصورة الدواخل (تنكشف بالكشّاف).', 'bilad-auto' ),
		)
	);

	// صورة السقوف
	$wp_customize->add_setting( 'bilad_hero_base', array( 'default' => '', 'sanitize_callback' => 'esc_url_raw' ) );
	$wp_customize->add_control(
		new WP_Customize_Image_Control(
			$wp_customize,
			'bilad_hero_base',
			array(
				'label'       => __( 'الطبقة 1: صورة السقوف (ليلاً)', 'bilad-auto' ),
				'description' => __( 'نظرة جوية للمحلة — بيوت بألواح شمسية وشبابيك مضوية، وبيوت مظلمة.', 'bilad-auto' ),
				'section'     => 'bilad_hero',
			)
		)
	);

	// صورة الإكس راي
	$wp_customize->add_setting( 'bilad_hero_xray', array( 'default' => '', 'sanitize_callback' => 'esc_url_raw' ) );
	$wp_customize->add_control(
		new WP_Customize_Image_Control(
			$wp_customize,
			'bilad_hero_xray',
			array(
				'label'       => __( 'الطبقة 2: صورة الإكس راي (الدواخل)', 'bilad-auto' ),
				'description' => __( 'نفس المشهد بنظرة مقطوعة — دواخل البيوت. لازم نفس أبعاد صورة السقوف تماماً.', 'bilad-auto' ),
				'section'     => 'bilad_hero',
			)
		)
	);

	// فيديو الإكس راي (اختياري)
	$wp_customize->add_setting( 'bilad_hero_xray_video', array( 'default' => '', 'sanitize_callback' => 'esc_url_raw' ) );
	$wp_customize->add_control(
		'bilad_hero_xray_video',
		array(
			'label'       => __( 'فيديو الدواخل (اختياري — يستبدل صورة الإكس راي)', 'bilad-auto' ),
			'description' => __( 'رابط ملف MP4. ارفعه من الوسائط وانسخ الرابط.', 'bilad-auto' ),
			'section'     => 'bilad_hero',
			'type'        => 'url',
		)
	);

	// فيديو السيارة (الطبقة 3)
	$wp_customize->add_setting( 'bilad_hero_car_video', array( 'default' => '', 'sanitize_callback' => 'esc_url_raw' ) );
	$wp_customize->add_control(
		'bilad_hero_car_video',
		array(
			'label'       => __( 'الطبقة 3: فيديو السيارة (WebM بخلفية شفافة)', 'bilad-auto' ),
			'description' => __( 'يظهر دائماً فوق كل الطبقات.', 'bilad-auto' ),
			'section'     => 'bilad_hero',
			'type'        => 'url',
		)
	);

	// نصوص الهيرو
	$hero_texts = array(
		'bilad_hero_headline' => array(
			'label'   => __( 'العنوان الرئيسي', 'bilad-auto' ),
			'default' => 'حياتك لا تنتظر الكهرباء',
		),
		'bilad_hero_sub'      => array(
			'label'   => __( 'النص الفرعي', 'bilad-auto' ),
			'default' => 'بلاد أوتو — الطاقة الشمسية التي تضيء بيتك كل ليلة',
		),
		'bilad_hero_cta'      => array(
			'label'   => __( 'نص زر الدعوة', 'bilad-auto' ),
			'default' => 'احصل على عرض سعر',
		),
	);

	foreach ( $hero_texts as $id => $field ) {
		$wp_customize->add_setting(
			$id,
			array( 'default' => $field['default'], 'sanitize_callback' => 'sanitize_text_field' )
		);
		$wp_customize->add_control( $id, array( 'label' => $field['label'], 'section' => 'bilad_hero', 'type' => 'text' ) );
	}

	/* ── قسم: الإحصائيات ─────────────────────── */
	$wp_customize->add_section(
		'bilad_stats',
		array(
			'title'    => __( 'الإحصائيات', 'bilad-auto' ),
			'priority' => 32,
		)
	);

	$stats = array(
		'bilad_stat1_num'   => array( 'label' => __( 'الرقم 1', 'bilad-auto' ), 'default' => '500' ),
		'bilad_stat1_label' => array( 'label' => __( 'وصف الرقم 1', 'bilad-auto' ), 'default' => 'مشروع منجز' ),
		'bilad_stat2_num'   => array( 'label' => __( 'الرقم 2', 'bilad-auto' ), 'default' => '8' ),
		'bilad_stat2_label' => array( 'label' => __( 'وصف الرقم 2', 'bilad-auto' ), 'default' => 'سنوات خبرة' ),
		'bilad_stat3_num'   => array( 'label' => __( 'الرقم 3', 'bilad-auto' ), 'default' => '98' ),
		'bilad_stat3_label' => array( 'label' => __( 'وصف الرقم 3', 'bilad-auto' ), 'default' => '% رضا العملاء' ),
	);

	foreach ( $stats as $id => $field ) {
		$wp_customize->add_setting( $id, array( 'default' => $field['default'], 'sanitize_callback' => 'sanitize_text_field' ) );
		$wp_customize->add_control( $id, array( 'label' => $field['label'], 'section' => 'bilad_stats', 'type' => 'text' ) );
	}

	/* ── قسم: الألوان ─────────────────────── */
	$wp_customize->add_section(
		'bilad_colors',
		array(
			'title'    => __( 'ألوان الهوية', 'bilad-auto' ),
			'priority' => 33,
		)
	);

	$colors = array(
		'bilad_color_gold' => array( 'label' => __( 'اللون الذهبي', 'bilad-auto' ), 'default' => '#ffc83d' ),
		'bilad_color_dark' => array( 'label' => __( 'الخلفية الداكنة', 'bilad-auto' ), 'default' => '#0a0e1a' ),
	);

	foreach ( $colors as $id => $field ) {
		$wp_customize->add_setting( $id, array( 'default' => $field['default'], 'sanitize_callback' => 'sanitize_hex_color' ) );
		$wp_customize->add_control(
			new WP_Customize_Color_Control( $wp_customize, $id, array( 'label' => $field['label'], 'section' => 'bilad_colors' ) )
		);
	}
}
add_action( 'customize_register', 'bilad_customize_register' );

/**
 * حقن ألوان المخصص كمتغيرات CSS
 */
function bilad_custom_colors() {
	$gold = get_theme_mod( 'bilad_color_gold', '#ffc83d' );
	$dark = get_theme_mod( 'bilad_color_dark', '#0a0e1a' );
	?>
	<style id="bilad-custom-colors">
		:root {
			--gold: <?php echo esc_attr( $gold ); ?>;
			--dark-bg: <?php echo esc_attr( $dark ); ?>;
		}
	</style>
	<?php
}
add_action( 'wp_head', 'bilad_custom_colors', 100 );

/**
 * معالجة نموذج طلب عرض السعر عبر AJAX
 */
function bilad_handle_quote_form() {
	check_ajax_referer( 'bilad_nonce', 'nonce' );

	$name        = isset( $_POST['name'] ) ? sanitize_text_field( wp_unslash( $_POST['name'] ) ) : '';
	$phone       = isset( $_POST['phone'] ) ? sanitize_text_field( wp_unslash( $_POST['phone'] ) ) : '';
	$type        = isset( $_POST['project_type'] ) ? sanitize_text_field( wp_unslash( $_POST['project_type'] ) ) : '';
	$consumption = isset( $_POST['consumption'] ) ? sanitize_text_field( wp_unslash( $_POST['consumption'] ) ) : '';
	$message     = isset( $_POST['message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['message'] ) ) : '';

	if ( empty( $name ) || empty( $phone ) ) {
		wp_send_json_error( array( 'message' => __( 'الرجاء إدخال الاسم ورقم الهاتف.', 'bilad-auto' ) ) );
	}

	// حفظ الطلب كمقال خاص
	$post_id = wp_insert_post(
		array(
			'post_type'    => 'bilad_quote',
			'post_title'   => sprintf( '%s — %s', $name, $phone ),
			'post_content' => $message,
			'post_status'  => 'private',
			'meta_input'   => array(
				'_bilad_phone'       => $phone,
				'_bilad_type'        => $type,
				'_bilad_consumption' => $consumption,
			),
		)
	);

	// إرسال إيميل للإدارة
	$admin_email = get_option( 'admin_email' );
	$subject     = sprintf( __( 'طلب عرض سعر جديد من %s', 'bilad-auto' ), $name );
	$body        = sprintf(
		"الاسم: %s\nالهاتف: %s\nنوع المشروع: %s\nالاستهلاك الشهري: %s\n\nالرسالة:\n%s",
		$name,
		$phone,
		$type,
		$consumption,
		$message
	);

	wp_mail( $admin_email, $subject, $body );

	wp_send_json_success( array( 'message' => __( 'تم إرسال طلبك بنجاح — سنتواصل معك قريباً!', 'bilad-auto' ) ) );
}
add_action( 'wp_ajax_bilad_quote', 'bilad_handle_quote_form' );
add_action( 'wp_ajax_nopriv_bilad_quote', 'bilad_handle_quote_form' );

/**
 * تسجيل نوع محتوى لحفظ طلبات عروض الأسعار
 */
function bilad_register_quotes_cpt() {
	register_post_type(
		'bilad_quote',
		array(
			'labels'       => array(
				'name'          => __( 'طلبات الأسعار', 'bilad-auto' ),
				'singular_name' => __( 'طلب سعر', 'bilad-auto' ),
				'menu_name'     => __( 'طلبات الأسعار', 'bilad-auto' ),
			),
			'public'       => false,
			'show_ui'      => true,
			'menu_icon'    => 'dashicons-email-alt',
			'menu_position'=> 7,
			'supports'     => array( 'title', 'editor', 'custom-fields' ),
			'capabilities' => array( 'create_posts' => 'do_not_allow' ),
			'map_meta_cap' => true,
		)
	);
}
add_action( 'init', 'bilad_register_quotes_cpt' );

/**
 * عرض أعمدة مخصصة لطلبات الأسعار في لوحة التحكم
 */
function bilad_quote_columns( $columns ) {
	$columns['bilad_phone'] = __( 'الهاتف', 'bilad-auto' );
	$columns['bilad_type']  = __( 'نوع المشروع', 'bilad-auto' );
	return $columns;
}
add_filter( 'manage_bilad_quote_posts_columns', 'bilad_quote_columns' );

function bilad_quote_column_content( $column, $post_id ) {
	if ( 'bilad_phone' === $column ) {
		echo esc_html( get_post_meta( $post_id, '_bilad_phone', true ) );
	}
	if ( 'bilad_type' === $column ) {
		echo esc_html( get_post_meta( $post_id, '_bilad_type', true ) );
	}
}
add_action( 'manage_bilad_quote_posts_custom_column', 'bilad_quote_column_content', 10, 2 );

/**
 * دوال مساعدة
 */

// رابط الواتساب
function bilad_whatsapp_url( $text = '' ) {
	$number = get_theme_mod( 'bilad_whatsapp', '9647712345678' );
	$number = preg_replace( '/[^0-9]/', '', $number );
	$url    = 'https://wa.me/' . $number;
	if ( $text ) {
		$url .= '?text=' . rawurlencode( $text );
	}
	return $url;
}

// أيقونة الواتساب SVG
function bilad_whatsapp_icon( $size = 24 ) {
	return sprintf(
		'<svg width="%1$d" height="%1$d" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
		absint( $size )
	);
}

// شعار الشمس SVG
function bilad_sun_icon( $size = 34 ) {
	$gold = get_theme_mod( 'bilad_color_gold', '#ffc83d' );
	return sprintf(
		'<svg width="%1$d" height="%1$d" viewBox="0 0 34 34" fill="none" aria-hidden="true">
			<circle cx="17" cy="17" r="7" fill="%2$s"/>
			<line x1="17" y1="2" x2="17" y2="0" stroke="%2$s" stroke-width="2.5" stroke-linecap="round"/>
			<line x1="17" y1="34" x2="17" y2="32" stroke="%2$s" stroke-width="2.5" stroke-linecap="round"/>
			<line x1="2" y1="17" x2="0" y2="17" stroke="%2$s" stroke-width="2.5" stroke-linecap="round"/>
			<line x1="34" y1="17" x2="32" y2="17" stroke="%2$s" stroke-width="2.5" stroke-linecap="round"/>
			<line x1="6.22" y1="6.22" x2="4.81" y2="4.81" stroke="%2$s" stroke-width="2" stroke-linecap="round"/>
			<line x1="29.19" y1="29.19" x2="27.78" y2="27.78" stroke="%2$s" stroke-width="2" stroke-linecap="round"/>
			<line x1="27.78" y1="6.22" x2="29.19" y2="4.81" stroke="%2$s" stroke-width="2" stroke-linecap="round"/>
			<line x1="4.81" y1="29.19" x2="6.22" y2="27.78" stroke="%2$s" stroke-width="2" stroke-linecap="round"/>
		</svg>',
		absint( $size ),
		esc_attr( $gold )
	);
}

/**
 * زر الواتساب العائم — يظهر في كل الصفحات
 */
function bilad_floating_whatsapp() {
	?>
	<a href="<?php echo esc_url( bilad_whatsapp_url( 'مرحباً، أريد الاستفسار عن أنظمة الطاقة الشمسية' ) ); ?>"
	   class="whatsapp-float"
	   target="_blank"
	   rel="noopener"
	   aria-label="<?php esc_attr_e( 'تواصل عبر واتساب', 'bilad-auto' ); ?>">
		<?php echo bilad_whatsapp_icon( 28 ); // phpcs:ignore WordPress.Security.EscapeOutput ?>
	</a>
	<?php
}
add_action( 'wp_footer', 'bilad_floating_whatsapp' );

/**
 * إضافة كلاس اللغة للـ body
 */
function bilad_body_classes( $classes ) {
	$classes[] = 'bilad-theme';
	if ( is_rtl() ) {
		$classes[] = 'is-rtl';
	}
	return $classes;
}
add_filter( 'body_class', 'bilad_body_classes' );

/**
 * تقصير المقتطف
 */
function bilad_excerpt_length( $length ) {
	return 22;
}
add_filter( 'excerpt_length', 'bilad_excerpt_length' );

function bilad_excerpt_more( $more ) {
	return '…';
}
add_filter( 'excerpt_more', 'bilad_excerpt_more' );

/**
 * تنظيف رأس الصفحة
 */
remove_action( 'wp_head', 'wp_generator' );
remove_action( 'wp_head', 'wlwmanifest_link' );
remove_action( 'wp_head', 'rsd_link' );

/**
 * تحميل الملفات المساعدة
 */
require_once BILAD_DIR . '/inc/meta-boxes.php';
