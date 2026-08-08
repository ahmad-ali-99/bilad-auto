<?php
/**
 * الصفحة الرئيسية — تحتوي على الهيرو التفاعلي (الإكس راي)
 *
 * @package BiladAuto
 */

get_header();

$hero_base       = get_theme_mod( 'bilad_hero_base', '' );
$hero_xray       = get_theme_mod( 'bilad_hero_xray', '' );
$hero_xray_video = get_theme_mod( 'bilad_hero_xray_video', '' );
$hero_car_video  = get_theme_mod( 'bilad_hero_car_video', '' );
$headline        = get_theme_mod( 'bilad_hero_headline', 'حياتك لا تنتظر الكهرباء' );
$subtext         = get_theme_mod( 'bilad_hero_sub', 'بلاد أوتو — الطاقة الشمسية التي تضيء بيتك كل ليلة' );
$cta_text        = get_theme_mod( 'bilad_hero_cta', 'احصل على عرض سعر' );
?>

<!-- ══ الهيرو التفاعلي: الإكس راي ══════════════════════ -->
<section class="hero-section" id="hero">

	<!-- الطبقة 1: السقوف (ثابتة، دائماً ظاهرة) -->
	<div class="hero-layer layer-night layer-base">
		<?php if ( $hero_base ) : ?>
			<img src="<?php echo esc_url( $hero_base ); ?>"
			     alt="<?php esc_attr_e( 'محلة بغدادية ليلاً — بيوت بألواح شمسية', 'bilad-auto' ); ?>"
			     class="hero-bg-img"
			     fetchpriority="high">
		<?php else : ?>
			<div class="hero-placeholder">
				<p><?php esc_html_e( 'ارفع صورة السقوف من: تخصيص ← الهيرو التفاعلي', 'bilad-auto' ); ?></p>
			</div>
		<?php endif; ?>
	</div>

	<!-- الطبقة 2: الإكس راي (تنكشف بالكشّاف) -->
	<div class="hero-layer layer-xray" id="layer-xray">
		<?php if ( $hero_xray_video ) : ?>
			<video class="hero-bg-video" autoplay muted loop playsinline
			       <?php if ( $hero_xray ) : ?>poster="<?php echo esc_url( $hero_xray ); ?>"<?php endif; ?>>
				<source src="<?php echo esc_url( $hero_xray_video ); ?>" type="video/mp4">
			</video>
		<?php elseif ( $hero_xray ) : ?>
			<img src="<?php echo esc_url( $hero_xray ); ?>"
			     alt="<?php esc_attr_e( 'داخل البيوت — الفرق بين من عنده طاقة ومن ينتظر', 'bilad-auto' ); ?>"
			     class="hero-bg-img">
		<?php endif; ?>
	</div>

	<!-- الطبقة 3: السيارة (فوق كل شيء، دائماً ظاهرة) -->
	<?php if ( $hero_car_video ) : ?>
		<div class="hero-layer layer-car">
			<video class="floating-car" autoplay muted loop playsinline>
				<source src="<?php echo esc_url( $hero_car_video ); ?>" type="video/webm">
			</video>
		</div>
	<?php endif; ?>

	<!-- التدرج -->
	<div class="hero-overlay"></div>

	<!-- المحتوى -->
	<div class="hero-content">
		<span class="hero-eyebrow"><?php esc_html_e( 'بغداد · العراق', 'bilad-auto' ); ?></span>
		<h1 class="hero-headline"><?php echo esc_html( $headline ); ?></h1>
		<p class="hero-subtext"><?php echo esc_html( $subtext ); ?></p>
		<a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>" class="hero-cta btn btn-gold">
			<?php echo esc_html( $cta_text ); ?>
		</a>
	</div>

	<!-- تلميح الكشّاف -->
	<div class="hero-hint spotlight-hint" id="spotlight-hint">
		<span class="hint-desktop"><?php esc_html_e( 'حرّك الماوس لتكشف القصص', 'bilad-auto' ); ?></span>
		<span class="hint-mobile"><?php esc_html_e( 'المس لتكشف القصص', 'bilad-auto' ); ?></span>
		<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
			<path d="M9 3v12M4 10l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</div>

</section>

<!-- ══ شريط الإحصائيات ══════════════════════════════ -->
<section class="stats-bar">
	<div class="container">
		<div class="stats-bar-grid">
			<?php for ( $i = 1; $i <= 3; $i++ ) : ?>
				<div class="stat-item fade-in">
					<span class="stat-number" data-target="<?php echo esc_attr( get_theme_mod( "bilad_stat{$i}_num", '' ) ); ?>">0</span>
					<span class="stat-plus">+</span>
					<span class="stat-desc"><?php echo esc_html( get_theme_mod( "bilad_stat{$i}_label", '' ) ); ?></span>
				</div>
			<?php endfor; ?>
		</div>
	</div>
</section>

<!-- ══ لمحة عن الخدمات ══════════════════════════════ -->
<section class="section services-preview">
	<div class="container">
		<div class="section-header text-center">
			<span class="section-eyebrow"><?php esc_html_e( 'ماذا نقدم', 'bilad-auto' ); ?></span>
			<h2><?php esc_html_e( 'حلول طاقة متكاملة', 'bilad-auto' ); ?></h2>
			<div class="gold-line"></div>
		</div>

		<div class="services-grid">
			<?php
			$services = new WP_Query(
				array(
					'post_type'      => 'service',
					'posts_per_page' => 3,
				)
			);

			if ( $services->have_posts() ) :
				while ( $services->have_posts() ) :
					$services->the_post();
					?>
					<a href="<?php the_permalink(); ?>" class="service-card fade-in">
						<?php if ( has_post_thumbnail() ) : ?>
							<div class="card-icon"><?php the_post_thumbnail( 'thumbnail' ); ?></div>
						<?php endif; ?>
						<div class="card-title"><?php the_title(); ?></div>
						<p class="card-text"><?php echo esc_html( get_the_excerpt() ); ?></p>
						<span class="card-link"><?php esc_html_e( 'اعرف أكثر', 'bilad-auto' ); ?> ←</span>
					</a>
					<?php
				endwhile;
				wp_reset_postdata();
			else :
				// بطاقات افتراضية إذا لم تُضف خدمات بعد
				$default_services = array(
					array( 'title' => __( 'منظومات سكنية', 'bilad-auto' ), 'text' => __( 'حلول مخصصة للبيوت والفلل حسب استهلاكك الفعلي.', 'bilad-auto' ) ),
					array( 'title' => __( 'منظومات تجارية', 'bilad-auto' ), 'text' => __( 'أنظمة ضخمة للمصانع والفنادق والمجمعات التجارية.', 'bilad-auto' ) ),
					array( 'title' => __( 'الصيانة والدعم', 'bilad-auto' ), 'text' => __( 'فحص دوري وتنظيف واستجابة طوارئ على مدار الساعة.', 'bilad-auto' ) ),
				);
				foreach ( $default_services as $svc ) :
					?>
					<div class="service-card fade-in">
						<div class="card-title"><?php echo esc_html( $svc['title'] ); ?></div>
						<p class="card-text"><?php echo esc_html( $svc['text'] ); ?></p>
					</div>
					<?php
				endforeach;
			endif;
			?>
		</div>
	</div>
</section>

<!-- ══ المشروع المميز ═══════════════════════════════ -->
<?php
$featured = new WP_Query(
	array(
		'post_type'      => 'project',
		'posts_per_page' => 1,
		'meta_key'       => '_bilad_featured',
		'meta_value'     => '1',
	)
);

if ( ! $featured->have_posts() ) {
	$featured = new WP_Query( array( 'post_type' => 'project', 'posts_per_page' => 1 ) );
}

if ( $featured->have_posts() ) :
	while ( $featured->have_posts() ) :
		$featured->the_post();
		?>
		<section class="section featured-section">
			<div class="container">
				<div class="featured-project fade-in">
					<?php if ( has_post_thumbnail() ) : ?>
						<div class="featured-project-img">
							<?php the_post_thumbnail( 'bilad-project' ); ?>
							<div class="featured-badge"><?php esc_html_e( 'مشروع مميز', 'bilad-auto' ); ?></div>
						</div>
					<?php endif; ?>
					<div class="featured-project-info">
						<h2><?php the_title(); ?></h2>
						<div class="project-desc"><?php the_excerpt(); ?></div>
						<a href="<?php the_permalink(); ?>" class="btn btn-gold">
							<?php esc_html_e( 'تفاصيل المشروع', 'bilad-auto' ); ?>
						</a>
					</div>
				</div>
			</div>
		</section>
		<?php
	endwhile;
	wp_reset_postdata();
endif;
?>

<!-- ══ دعوة للعمل ═══════════════════════════════════ -->
<section class="cta-section section">
	<div class="container">
		<div class="cta-box">
			<h2><?php esc_html_e( 'ابدأ رحلتك مع الطاقة الشمسية', 'bilad-auto' ); ?></h2>
			<p><?php esc_html_e( 'استشارة مجانية وعرض سعر خلال 24 ساعة', 'bilad-auto' ); ?></p>
			<div class="cta-btns">
				<a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>" class="btn btn-gold">
					<?php esc_html_e( 'احصل على عرض سعر', 'bilad-auto' ); ?>
				</a>
				<a href="<?php echo esc_url( bilad_whatsapp_url() ); ?>" class="btn btn-outline" target="_blank" rel="noopener">
					<?php echo bilad_whatsapp_icon( 20 ); // phpcs:ignore WordPress.Security.EscapeOutput ?>
					<?php esc_html_e( 'واتساب مباشر', 'bilad-auto' ); ?>
				</a>
			</div>
		</div>
	</div>
</section>

<?php get_footer(); ?>
