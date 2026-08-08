<?php
/**
 * Template Name: صفحة التواصل
 *
 * @package BiladAuto
 */

get_header();

$whatsapp = get_theme_mod( 'bilad_phone', '+964 771 234 5678' );
$email    = get_theme_mod( 'bilad_email', 'info@biladauto.iq' );
$address  = get_theme_mod( 'bilad_address', 'بغداد، العراق' );
$hours    = get_theme_mod( 'bilad_hours', 'السبت – الخميس، 9 صباحاً – 6 مساءً' );
$map      = get_theme_mod( 'bilad_map_embed', '' );
?>

<header class="page-header">
	<div class="container">
		<span class="section-eyebrow"><?php esc_html_e( 'نحن هنا', 'bilad-auto' ); ?></span>
		<h1 class="page-title"><?php the_title(); ?></h1>
		<p class="page-subtitle"><?php esc_html_e( 'خذ الخطوة الأولى — عرض السعر مجاني وبدون التزام', 'bilad-auto' ); ?></p>
	</div>
</header>

<!-- زر واتساب كبير -->
<section class="section-sm">
	<div class="container">
		<a href="<?php echo esc_url( bilad_whatsapp_url( 'مرحباً، أريد عرض سعر لمنظومة طاقة شمسية' ) ); ?>"
		   class="whatsapp-hero-btn fade-in" target="_blank" rel="noopener">
			<?php echo bilad_whatsapp_icon( 40 ); // phpcs:ignore WordPress.Security.EscapeOutput ?>
			<div>
				<span class="wa-label"><?php esc_html_e( 'تواصل عبر واتساب الآن', 'bilad-auto' ); ?></span>
				<span class="wa-number"><?php echo esc_html( $whatsapp ); ?></span>
			</div>
		</a>
	</div>
</section>

<section class="section">
	<div class="container">
		<div class="contact-layout">

			<!-- النموذج -->
			<div class="contact-form-wrap fade-in">
				<h2><?php esc_html_e( 'أرسل طلبك', 'bilad-auto' ); ?></h2>
				<p class="form-subtitle"><?php esc_html_e( 'سنتواصل معك خلال 24 ساعة', 'bilad-auto' ); ?></p>

				<form class="contact-form" id="bilad-quote-form">
					<div class="form-group">
						<label for="bilad-name"><?php esc_html_e( 'الاسم الكامل', 'bilad-auto' ); ?> *</label>
						<input type="text" id="bilad-name" name="name" required class="form-input"
						       placeholder="<?php esc_attr_e( 'محمد أحمد', 'bilad-auto' ); ?>">
					</div>

					<div class="form-group">
						<label for="bilad-phone"><?php esc_html_e( 'رقم الهاتف', 'bilad-auto' ); ?> *</label>
						<input type="tel" id="bilad-phone" name="phone" required class="form-input" dir="ltr"
						       placeholder="+964 7XX XXX XXXX">
					</div>

					<div class="form-group">
						<label for="bilad-type"><?php esc_html_e( 'نوع المشروع', 'bilad-auto' ); ?></label>
						<select id="bilad-type" name="project_type" class="form-input">
							<option value=""><?php esc_html_e( 'اختر نوع المشروع', 'bilad-auto' ); ?></option>
							<option value="residential"><?php esc_html_e( 'سكني', 'bilad-auto' ); ?></option>
							<option value="commercial"><?php esc_html_e( 'تجاري', 'bilad-auto' ); ?></option>
							<option value="industrial"><?php esc_html_e( 'صناعي', 'bilad-auto' ); ?></option>
							<option value="maintenance"><?php esc_html_e( 'صيانة', 'bilad-auto' ); ?></option>
						</select>
					</div>

					<div class="form-group">
						<label for="bilad-consumption"><?php esc_html_e( 'الاستهلاك الشهري تقريباً (كيلوواط ساعة)', 'bilad-auto' ); ?></label>
						<input type="number" id="bilad-consumption" name="consumption" class="form-input" min="0"
						       placeholder="<?php esc_attr_e( 'مثال: 500', 'bilad-auto' ); ?>">
					</div>

					<div class="form-group">
						<label for="bilad-message"><?php esc_html_e( 'تفاصيل إضافية', 'bilad-auto' ); ?></label>
						<textarea id="bilad-message" name="message" rows="4" class="form-input"
						          placeholder="<?php esc_attr_e( 'أي تفاصيل تساعدنا نفهم احتياجك أكثر...', 'bilad-auto' ); ?>"></textarea>
					</div>

					<button type="submit" class="btn btn-gold btn-full">
						<span class="btn-text"><?php esc_html_e( 'أرسل طلبك', 'bilad-auto' ); ?></span>
						<span class="btn-loading hidden"><?php esc_html_e( 'جاري الإرسال...', 'bilad-auto' ); ?></span>
					</button>

					<div id="bilad-form-message" class="form-success hidden"></div>
				</form>
			</div>

			<!-- معلومات التواصل -->
			<div class="contact-info-wrap fade-in">

				<div class="info-card">
					<div class="info-icon">
						<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" stroke="currentColor" stroke-width="1.5"/><path d="M14 7v7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</div>
					<div>
						<h4><?php esc_html_e( 'ساعات العمل', 'bilad-auto' ); ?></h4>
						<p><?php echo esc_html( $hours ); ?></p>
					</div>
				</div>

				<div class="info-card">
					<div class="info-icon">
						<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 2C9.58 2 6 5.58 6 10c0 6 8 16 8 16s8-10 8-16c0-4.42-3.58-8-8-8z" stroke="currentColor" stroke-width="1.5"/><circle cx="14" cy="10" r="3" stroke="currentColor" stroke-width="1.5"/></svg>
					</div>
					<div>
						<h4><?php esc_html_e( 'الموقع', 'bilad-auto' ); ?></h4>
						<p><?php echo esc_html( $address ); ?></p>
					</div>
				</div>

				<?php if ( $email ) : ?>
					<div class="info-card">
						<div class="info-icon">
							<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="3" y="6" width="22" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 8l11 8 11-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
						</div>
						<div>
							<h4><?php esc_html_e( 'البريد الإلكتروني', 'bilad-auto' ); ?></h4>
							<a href="mailto:<?php echo esc_attr( $email ); ?>" class="info-link"><?php echo esc_html( $email ); ?></a>
						</div>
					</div>
				<?php endif; ?>

				<?php if ( $map ) : ?>
					<div class="map-embed">
						<iframe src="<?php echo esc_url( $map ); ?>" width="100%" height="250" style="border:0;"
						        allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
					</div>
				<?php else : ?>
					<div class="map-placeholder">
						<div class="map-inner">
							<p><?php esc_html_e( 'أضف رابط الخريطة من: تخصيص ← معلومات التواصل', 'bilad-auto' ); ?></p>
						</div>
					</div>
				<?php endif; ?>

			</div>
		</div>
	</div>
</section>

<?php get_footer(); ?>
