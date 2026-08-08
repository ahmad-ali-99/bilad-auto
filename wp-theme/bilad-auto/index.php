<?php
/**
 * القالب الافتراضي
 *
 * @package BiladAuto
 */

get_header();
?>

<header class="page-header">
	<div class="container">
		<h1 class="page-title">
			<?php
			if ( is_home() && ! is_front_page() ) {
				single_post_title();
			} elseif ( is_archive() ) {
				the_archive_title();
			} elseif ( is_search() ) {
				printf( esc_html__( 'نتائج البحث عن: %s', 'bilad-auto' ), '<span>' . get_search_query() . '</span>' );
			} else {
				esc_html_e( 'المدونة', 'bilad-auto' );
			}
			?>
		</h1>
		<?php if ( is_archive() && get_the_archive_description() ) : ?>
			<p class="page-subtitle"><?php echo wp_kses_post( get_the_archive_description() ); ?></p>
		<?php endif; ?>
	</div>
</header>

<section class="section">
	<div class="container">
		<?php if ( have_posts() ) : ?>
			<div class="posts-grid">
				<?php
				while ( have_posts() ) :
					the_post();
					?>
					<article id="post-<?php the_ID(); ?>" <?php post_class( 'post-card fade-in' ); ?>>
						<?php if ( has_post_thumbnail() ) : ?>
							<a href="<?php the_permalink(); ?>" class="post-card-img">
								<?php the_post_thumbnail( 'bilad-project' ); ?>
							</a>
						<?php endif; ?>
						<div class="post-card-body">
							<h2 class="post-card-title">
								<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
							</h2>
							<p class="post-card-excerpt"><?php echo esc_html( get_the_excerpt() ); ?></p>
							<a href="<?php the_permalink(); ?>" class="card-link">
								<?php esc_html_e( 'اقرأ المزيد', 'bilad-auto' ); ?> ←
							</a>
						</div>
					</article>
					<?php
				endwhile;
				?>
			</div>

			<div class="pagination-wrap">
				<?php
				the_posts_pagination(
					array(
						'prev_text' => esc_html__( 'السابق', 'bilad-auto' ),
						'next_text' => esc_html__( 'التالي', 'bilad-auto' ),
					)
				);
				?>
			</div>

		<?php else : ?>
			<div class="no-results">
				<p><?php esc_html_e( 'لا توجد نتائج.', 'bilad-auto' ); ?></p>
			</div>
		<?php endif; ?>
	</div>
</section>

<?php get_footer(); ?>
